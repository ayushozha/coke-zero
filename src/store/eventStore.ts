import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  Anomaly,
  Attribution,
  ConnectionStatus,
  Decision,
  KBEntry,
  OsintEmbeddingSnapshot,
  ReasoningTrace,
  Signal,
  UIEvent,
  ViewMode,
} from "../types/canopy";

const RING_BUFFER = 200;
const TRACE_BUFFER = 500;

function pushBounded<T>(buffer: T[], item: T): T[] {
  const next = [item, ...buffer];
  if (next.length > RING_BUFFER) next.length = RING_BUFFER;
  return next;
}

function appendBounded<T>(buffer: T[], item: T, cap: number): T[] {
  const next = [...buffer, item];
  if (next.length > cap) next.splice(0, next.length - cap);
  return next;
}

interface EventState {
  // Per-kind ring buffers, newest first.
  signals: Signal[];
  anomalies: Anomaly[];
  attributions: Attribution[];
  decisions: Decision[];
  uiEvents: UIEvent[];

  // Reasoning trace buffer, oldest first (terminal-style: latest at bottom).
  traces: ReasoningTrace[];

  // Latest OSINT semantic-clustering snapshot (replaces wholesale on each
  // arrival — the backend sends the full sliding window every time).
  embeddingSnapshot: OsintEmbeddingSnapshot | null;

  // Lookup tables for cross-event linking.
  signalsById: Record<string, Signal>;
  attributionsById: Record<string, Attribution>;
  decisionsById: Record<string, Decision>;

  // Connection + view state.
  connection: ConnectionStatus;
  view: ViewMode;
  selectedEventId: string | null;
  pendingApproval: UIEvent | null;
  approvedEventIds: Set<string>;
  /** Decision ids the operator accepted in the left-rail action panel. */
  acceptedDecisionIds: Set<string>;
  /** Decision ids the operator denied in the left-rail action panel. */
  deferredDecisionIds: Set<string>;
  takeoverEvent: UIEvent | null;

  // Knowledge base resolved by id (loaded once via GET /kb).
  kb: Record<string, KBEntry>;

  // Mutators.
  ingestSignal: (signal: Signal) => void;
  ingestAnomaly: (anomaly: Anomaly) => void;
  ingestAttribution: (attribution: Attribution) => void;
  ingestDecision: (decision: Decision) => void;
  ingestUIEvent: (event: UIEvent) => void;
  ingestTrace: (trace: ReasoningTrace) => void;
  ingestEmbeddingSnapshot: (snapshot: OsintEmbeddingSnapshot) => void;

  setConnection: (status: ConnectionStatus) => void;
  setView: (view: ViewMode) => void;
  selectEvent: (id: string | null) => void;
  dismissApproval: () => void;
  markApproved: (id: string) => void;
  acceptDecision: (id: string) => void;
  deferDecision: (id: string) => void;
  clearDecisionStatus: (id: string) => void;
  openTakeover: (event: UIEvent) => void;
  closeTakeover: () => void;
  setKB: (entries: KBEntry[]) => void;
  reset: () => void;
}

const initialState = (): Omit<
  EventState,
  | "ingestSignal"
  | "ingestAnomaly"
  | "ingestAttribution"
  | "ingestDecision"
  | "ingestUIEvent"
  | "ingestTrace"
  | "ingestEmbeddingSnapshot"
  | "setConnection"
  | "setView"
  | "selectEvent"
  | "dismissApproval"
  | "markApproved"
  | "acceptDecision"
  | "deferDecision"
  | "clearDecisionStatus"
  | "openTakeover"
  | "closeTakeover"
  | "setKB"
  | "reset"
> => ({
  signals: [],
  anomalies: [],
  attributions: [],
  decisions: [],
  uiEvents: [],
  traces: [],
  embeddingSnapshot: null,
  signalsById: {},
  attributionsById: {},
  decisionsById: {},
  connection: "connecting",
  view: "brigade",
  selectedEventId: null,
  pendingApproval: null,
  approvedEventIds: new Set(),
  acceptedDecisionIds: new Set(),
  deferredDecisionIds: new Set(),
  takeoverEvent: null,
  kb: {},
});

export const useEventStore = create<EventState>()(
  persist(
    (set) => ({
      ...initialState(),

      ingestSignal: (signal) =>
    set((state) => ({
      signals: pushBounded(state.signals, signal),
      signalsById: { ...state.signalsById, [signal.id]: signal },
    })),

  ingestAnomaly: (anomaly) =>
    set((state) => ({
      anomalies: pushBounded(state.anomalies, anomaly),
    })),

  ingestAttribution: (attribution) =>
    set((state) => ({
      attributions: pushBounded(state.attributions, attribution),
      attributionsById: {
        ...state.attributionsById,
        [attribution.id]: attribution,
      },
    })),

  ingestDecision: (decision) =>
    set((state) => ({
      decisions: pushBounded(state.decisions, decision),
      decisionsById: { ...state.decisionsById, [decision.id]: decision },
    })),

  ingestTrace: (trace) =>
    set((state) => ({
      traces: appendBounded(state.traces, trace, TRACE_BUFFER),
    })),

  ingestEmbeddingSnapshot: (snapshot) =>
    set({ embeddingSnapshot: snapshot }),

  ingestUIEvent: (event) =>
    set((state) => {
      const next = {
        uiEvents: pushBounded(state.uiEvents, event),
      } as Partial<EventState>;
      // Auto-pop the approve banner when a recommendation arrives, unless
      // this exact event has already been dismissed/approved.
      if (
        event.type === "recommendation_created" &&
        event.recommendation &&
        !state.approvedEventIds.has(event.id)
      ) {
        next.pendingApproval = event;
      }
      return next;
    }),

  setConnection: (connection) => set({ connection }),
  setView: (view) => set({ view }),
  selectEvent: (selectedEventId) => set({ selectedEventId }),
  dismissApproval: () => set({ pendingApproval: null }),
  markApproved: (id) =>
    set((state) => {
      const approvedEventIds = new Set(state.approvedEventIds);
      approvedEventIds.add(id);
      return {
        approvedEventIds,
        pendingApproval:
          state.pendingApproval?.id === id ? null : state.pendingApproval,
      };
    }),
  acceptDecision: (id) =>
    set((state) => {
      const acceptedDecisionIds = new Set(state.acceptedDecisionIds);
      acceptedDecisionIds.add(id);
      const deferredDecisionIds = new Set(state.deferredDecisionIds);
      deferredDecisionIds.delete(id);
      return { acceptedDecisionIds, deferredDecisionIds };
    }),
  deferDecision: (id) =>
    set((state) => {
      const deferredDecisionIds = new Set(state.deferredDecisionIds);
      deferredDecisionIds.add(id);
      const acceptedDecisionIds = new Set(state.acceptedDecisionIds);
      acceptedDecisionIds.delete(id);
      return { deferredDecisionIds, acceptedDecisionIds };
    }),
  clearDecisionStatus: (id) =>
    set((state) => {
      const acceptedDecisionIds = new Set(state.acceptedDecisionIds);
      const deferredDecisionIds = new Set(state.deferredDecisionIds);
      acceptedDecisionIds.delete(id);
      deferredDecisionIds.delete(id);
      return { acceptedDecisionIds, deferredDecisionIds };
    }),
  openTakeover: (event) => set({ takeoverEvent: event }),
  closeTakeover: () => set({ takeoverEvent: null }),
      setKB: (entries) =>
        set({
          kb: Object.fromEntries(entries.map((e) => [e.id, e])),
        }),
      reset: () => set(initialState()),
    }),
    {
      // Survives full-page navigations (the Brigade ↔ Operator header link
      // is a regular <a href>, so the JS state would otherwise reset on
      // every tab switch). Persisting the engine event ring buffers means
      // the reasoning panel and event timeline keep their history when
      // the user moves between pages.
      name: "halo-event-store",
      version: 2,
      storage: createJSONStorage(() => sessionStorage),
      // Skip live UI/connection state and the Set (Sets don't survive
      // JSON.stringify cleanly). KB is fetched fresh on each mount.
      partialize: (state) => ({
        signals: state.signals,
        anomalies: state.anomalies,
        attributions: state.attributions,
        decisions: state.decisions,
        uiEvents: state.uiEvents,
        traces: state.traces,
        embeddingSnapshot: state.embeddingSnapshot,
        signalsById: state.signalsById,
        attributionsById: state.attributionsById,
        decisionsById: state.decisionsById,
      }),
    },
  ),
);
