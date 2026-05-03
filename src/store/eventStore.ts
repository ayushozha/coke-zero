import { create } from "zustand";
import type {
  Anomaly,
  Attribution,
  ConnectionStatus,
  Decision,
  KBEntry,
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

  setConnection: (status: ConnectionStatus) => void;
  setView: (view: ViewMode) => void;
  selectEvent: (id: string | null) => void;
  dismissApproval: () => void;
  markApproved: (id: string) => void;
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
  | "setConnection"
  | "setView"
  | "selectEvent"
  | "dismissApproval"
  | "markApproved"
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
  signalsById: {},
  attributionsById: {},
  decisionsById: {},
  connection: "connecting",
  view: "brigade",
  selectedEventId: null,
  pendingApproval: null,
  approvedEventIds: new Set(),
  takeoverEvent: null,
  kb: {},
});

export const useEventStore = create<EventState>((set) => ({
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
  openTakeover: (event) => set({ takeoverEvent: event }),
  closeTakeover: () => set({ takeoverEvent: null }),
  setKB: (entries) =>
    set({
      kb: Object.fromEntries(entries.map((e) => [e.id, e])),
    }),
  reset: () => set(initialState()),
}));
