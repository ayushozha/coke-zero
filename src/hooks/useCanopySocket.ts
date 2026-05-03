import { useEffect, useState } from 'react'
import { useEventStore } from '../store/eventStore'
import type {
  Anomaly,
  Attribution,
  CanopyMessage,
  CanopySocketState,
  Decision,
  ReasoningTrace,
  Signal,
  UIEvent,
} from '../types/canopy'

export const MOCK_URL: string | null = null
// Backend gateway exposes /ws (see halo/api/__init__.py). The earlier
// /ws/brigade URL pointed at a route that doesn't exist, so the socket
// never connected and everything fell back to the local demo stream.
const DEV_BRIDGE_URL = 'ws://127.0.0.1:8000/ws'
const configuredUrl = import.meta.env.VITE_CANOPY_WS_URL?.trim()
const DEFAULT_URL: string | null =
  configuredUrl || (import.meta.env.DEV ? DEV_BRIDGE_URL : MOCK_URL)

const initialState: CanopySocketState = {
  signals: [],
  anomalies: [],
  attributions: [],
  decisions: [],
  uiEvents: [],
  traces: [],
  isConnected: false,
  lastError: null,
}

const prependLimited = <T extends { id: string }>(
  items: T[],
  next: T,
  limit: number,
) => [next, ...items.filter((item) => item.id !== next.id)].slice(0, limit)

// The gateway sends {"topic", "kind", "data"} envelopes (see
// halo/api/__init__.py:_fanout). Older fixtures used a {"type", "data"}
// shape — accept either so we don't drop real engine traffic on shape
// drift. Returns the normalized {type, data} value or null.
function normalizeMessage(value: unknown): CanopyMessage | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as {
    type?: unknown
    kind?: unknown
    data?: unknown
  }
  const discriminator =
    typeof candidate.type === 'string'
      ? candidate.type
      : typeof candidate.kind === 'string'
        ? candidate.kind
        : null
  if (!discriminator) return null
  if (
    !['signal', 'anomaly', 'attribution', 'decision', 'ui_event', 'trace'].includes(
      discriminator,
    )
  ) {
    return null
  }
  if (typeof candidate.data !== 'object' || candidate.data === null) return null
  return { type: discriminator, data: candidate.data } as CanopyMessage
}

function reduceMessage(
  state: CanopySocketState,
  message: CanopyMessage,
): CanopySocketState {
  switch (message.type) {
    case 'signal':
      return {
        ...state,
        signals: prependLimited<Signal>(state.signals, message.data, 50),
      }
    case 'anomaly':
      return {
        ...state,
        anomalies: prependLimited<Anomaly>(state.anomalies, message.data, 20),
      }
    case 'attribution':
      return {
        ...state,
        attributions: prependLimited<Attribution>(
          state.attributions,
          message.data,
          20,
        ),
      }
    case 'decision':
      return {
        ...state,
        decisions: prependLimited<Decision>(state.decisions, message.data, 20),
      }
    case 'ui_event':
      return {
        ...state,
        uiEvents: prependLimited<UIEvent>(state.uiEvents, message.data, 20),
      }
    case 'trace':
      // Mirror the trace into the global Zustand store so ReasoningPanel
      // (which reads from useEventStore) renders in real time. Local
      // state mirror stays for callers that read state.traces directly.
      useEventStore.getState().ingestTrace(message.data as ReasoningTrace)
      return {
        ...state,
        traces: [...state.traces, message.data as ReasoningTrace].slice(-500),
      }
  }
}

export function useCanopySocket(url: string | null = DEFAULT_URL) {
  const [state, setState] = useState<CanopySocketState>(initialState)

  useEffect(() => {
    if (!url) {
      return
    }

    const socket = new WebSocket(url)

    socket.addEventListener('open', () => {
      setState((current) => ({
        ...current,
        isConnected: true,
        lastError: null,
      }))
    })

    socket.addEventListener('close', () => {
      setState((current) => ({
        ...current,
        isConnected: false,
      }))
    })

    socket.addEventListener('error', () => {
      setState((current) => ({
        ...current,
        lastError: 'CANOPY socket error',
      }))
    })

    socket.addEventListener('message', (event: MessageEvent<string>) => {
      try {
        const parsed: unknown = JSON.parse(event.data)
        const message = normalizeMessage(parsed)
        if (!message) {
          return
        }

        setState((current) => reduceMessage(current, message))
      } catch {
        setState((current) => ({
          ...current,
          lastError: 'Invalid CANOPY socket payload',
        }))
      }
    })

    return () => {
      socket.close()
    }
  }, [url])

  return state
}
