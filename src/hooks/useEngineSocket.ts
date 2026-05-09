import { useEffect, useRef } from "react";
import { useEventStore } from "../store/eventStore";
import { COKE_ZERO_API_URL, COKE_ZERO_WS_URL } from "../lib/runtimeConfig";
import type {
  KBEntry,
  ReasoningTrace,
  Signal,
  UIEvent,
  WSEnvelope,
} from "../types/coke_zero";

const API_URL = COKE_ZERO_API_URL;
const WS_URL = COKE_ZERO_WS_URL;

const RECONNECT_BACKOFFS_MS = [500, 1500, 4000];
const FIXTURE_REPLAY_INTERVAL_MS = 3000;
const FIXTURE_SIGNAL_LOCATIONS: Record<string, { lat: number; lng: number; label: string }> = {
  // Synthesised marker positions for fixture mode — keeps the AOR map alive
  // when the engine isn't running and we're replaying expected_ui_events.json.
  "coke-zero-beat1-001": { lat: 21.3, lng: 142.8, label: "LEO track over Western Pacific" },
  "coke-zero-beat1-002": { lat: 20.1, lng: 121.7, label: "Luzon Strait" },
  "coke-zero-beat2-001": { lat: 13.5, lng: 144.8, label: "Guam RF site" },
  "coke-zero-beat2-002": { lat: 13.5, lng: 144.8, label: "Guam ground gateway" },
  "coke-zero-beat2-003": { lat: 18.5, lng: 121.0, label: "Northern Luzon monitor" },
  "coke-zero-beat2-004": { lat: 15.0, lng: 145.6, label: "Tinian launch corridor" },
  "coke-zero-beat47-001": { lat: 13.5, lng: 144.8, label: "Guam SATCOM gateway" },
  "coke-zero-beat47-002": { lat: 14.9, lng: 132.1, label: "coke-zero-LEO-07 relative motion frame" },
  "coke-zero-beat47-003": { lat: 14.5, lng: 133.8, label: "coke-zero-LEO-07 downlink footprint" },
  "coke-zero-beat47-004": { lat: 13.5, lng: 144.8, label: "Guam RF site" },
};

interface FixtureFile {
  events: UIEvent[];
}

/**
 * Connect to the engine WebSocket. On three consecutive failures, fall back
 * to fixture mode: load /fixture/ui_events and replay them on a timer.
 *
 * Returns nothing — the hook drives the global event store via side effects.
 * Components read from the store via `useEventStore`.
 */
export function useEngineSocket(): void {
  const setConnection = useEventStore((s) => s.setConnection);
  const ingestSignal = useEventStore((s) => s.ingestSignal);
  const ingestAnomaly = useEventStore((s) => s.ingestAnomaly);
  const ingestAttribution = useEventStore((s) => s.ingestAttribution);
  const ingestDecision = useEventStore((s) => s.ingestDecision);
  const ingestUIEvent = useEventStore((s) => s.ingestUIEvent);
  const ingestTrace = useEventStore((s) => s.ingestTrace);
  const setKB = useEventStore((s) => s.setKB);

  const failureCountRef = useRef(0);
  const fixtureTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let cancelled = false;

    // Pull the KB once at startup; it's static for a session.
    if (API_URL) {
      void fetch(`${API_URL}/kb`)
      .then((r) => r.json())
      .then((data: { entries: KBEntry[] }) => setKB(data.entries))
      .catch(() => {
        // KB load failure isn't fatal — the operator view degrades to "kb-..."
        // citation ids without expanded card content.
      });
    }

    function startFixtureMode() {
      setConnection("fixture");
      if (!API_URL) {
        setConnection("offline");
        return;
      }
      void fetch(`${API_URL}/fixture/ui_events`)
        .then((r) => r.json())
        .then((data: FixtureFile) => {
          let i = 0;
          const tick = () => {
            if (cancelled) return;
            const event = data.events[i % data.events.length];
            // Synthesise a fresh timestamp so the timeline shows live time.
            ingestUIEvent({ ...event, timestamp: new Date().toISOString() });
            // Synthesise marker signals so the AOR map has something.
            for (const sid of event.source_signal_ids ?? []) {
              const loc = FIXTURE_SIGNAL_LOCATIONS[sid];
              if (loc) {
                ingestSignal({
                  id: sid,
                  ts: new Date().toISOString(),
                  domain: "osint",
                  source: "fixture",
                  realism: "mock_operational",
                  confidence: event.confidence,
                  location: loc,
                  payload: { event_type: "fixture", summary: event.title },
                  provenance: { source_id: "fixture" },
                } as Signal);
              }
            }
            i += 1;
            fixtureTimerRef.current = window.setTimeout(
              tick,
              FIXTURE_REPLAY_INTERVAL_MS,
            );
          };
          tick();
        })
        .catch(() => setConnection("offline"));
    }

    function connect() {
      if (cancelled) return;
      if (!WS_URL) {
        startFixtureMode();
        return;
      }
      setConnection("connecting");
      try {
        socket = new WebSocket(WS_URL);
      } catch {
        scheduleReconnectOrFallback();
        return;
      }

      socket.addEventListener("open", () => {
        failureCountRef.current = 0;
        if (fixtureTimerRef.current !== null) {
          clearTimeout(fixtureTimerRef.current);
          fixtureTimerRef.current = null;
        }
        setConnection("live");
      });

      socket.addEventListener("message", (event) => {
        try {
          const envelope = JSON.parse(event.data) as WSEnvelope;
          switch (envelope.kind) {
            case "signal":
              ingestSignal(envelope.data as Signal);
              break;
            case "anomaly":
              ingestAnomaly(envelope.data as never);
              break;
            case "attribution":
              ingestAttribution(envelope.data as never);
              break;
            case "decision":
              ingestDecision(envelope.data as never);
              break;
            case "ui_event":
              ingestUIEvent(envelope.data as UIEvent);
              break;
            case "operator_action":
              break;
            case "trace":
              ingestTrace(envelope.data as ReasoningTrace);
              break;
          }
        } catch (err) {
          console.error("malformed envelope:", err, event.data);
        }
      });

      socket.addEventListener("close", () => {
        scheduleReconnectOrFallback();
      });

      socket.addEventListener("error", () => {
        try {
          socket?.close();
        } catch {
          /* ignored */
        }
      });
    }

    function scheduleReconnectOrFallback() {
      if (cancelled) return;
      const failures = failureCountRef.current;
      if (failures >= RECONNECT_BACKOFFS_MS.length) {
        startFixtureMode();
        return;
      }
      const delay = RECONNECT_BACKOFFS_MS[failures];
      failureCountRef.current = failures + 1;
      setConnection("connecting");
      reconnectTimer = window.setTimeout(connect, delay);
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      if (fixtureTimerRef.current !== null)
        clearTimeout(fixtureTimerRef.current);
      try {
        socket?.close();
      } catch {
        /* ignored */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Trigger a server-side scenario replay. Resolves when the request returns. */
export async function triggerReplay(
  name: string,
  speed = 5,
): Promise<void> {
  if (!API_URL) return;
  await fetch(
    `${API_URL}/scenarios/${encodeURIComponent(name)}/replay?speed=${speed}`,
    { method: "POST" },
  );
}

/** GET /scenarios — lists the available beats for the controls bar. */
export async function listScenarios(): Promise<string[]> {
  if (!API_URL) return [];
  try {
    const response = await fetch(`${API_URL}/scenarios`);
    if (!response.ok) return [];
    return (await response.json()) as string[];
  } catch {
    return [];
  }
}
