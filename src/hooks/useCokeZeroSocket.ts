import { useEffect, useState } from 'react'
import { useEventStore } from '../store/eventStore'
import { loadMissionMemory } from '../lib/missionMemory'
import { COKE_ZERO_WS_URL, STATIC_DEMO_ENABLED } from '../lib/runtimeConfig'
import { createStaticDemoMessages } from '../lib/staticDemoFeed'
import type {
  Anomaly,
  Attribution,
  CokeZeroMessage,
  CokeZeroSocketState,
  Decision,
  OsintEmbeddingSnapshot,
  ReasoningTrace,
  Signal,
  UIEvent,
} from '../types/coke_zero'

export const MOCK_URL: string | null = null
const DEFAULT_URL: string | null = COKE_ZERO_WS_URL ?? MOCK_URL
const STATIC_DEMO_TICK_MS = 650
const STATIC_DEMO_FALLBACK_MS = 2200

const initialState: CokeZeroSocketState = {
  signals: [],
  anomalies: [],
  attributions: [],
  decisions: [],
  uiEvents: [],
  traces: [],
  isConnected: false,
  lastError: null,
}

const setGlobalConnection = (status: 'connecting' | 'live' | 'fixture' | 'offline') => {
  useEventStore.getState().setConnection(status)
}

const prependLimited = <T extends { id: string }>(
  items: T[],
  next: T,
  limit: number,
) => [next, ...items.filter((item) => item.id !== next.id)].slice(0, limit)

// The gateway sends {"topic", "kind", "data"} envelopes (see
// coke_zero/api/__init__.py:_fanout). Older fixtures used a {"type", "data"}
// shape — accept either so we don't drop real engine traffic on shape
// drift. Returns the normalized {type, data} value or null.
function normalizeMessage(value: unknown): CokeZeroMessage | null {
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
    ![
      'signal',
      'anomaly',
      'attribution',
      'decision',
      'ui_event',
      'operator_action',
      'trace',
      'embedding',
    ].includes(discriminator)
  ) {
    return null
  }
  if (typeof candidate.data !== 'object' || candidate.data === null) return null
  return { type: discriminator, data: candidate.data } as CokeZeroMessage
}

function reduceMessage(
  state: CokeZeroSocketState,
  message: CokeZeroMessage,
): CokeZeroSocketState {
  // Mirror every event into the global Zustand store so the Operator
  // page (and any other consumer reading from useEventStore) sees the
  // same data Brigade sees. The local CokeZeroSocketState mirror is kept
  // because Brigade reads it directly for its decision-stack summary.
  const store = useEventStore.getState()
  switch (message.type) {
    case 'signal':
      store.ingestSignal(message.data as Signal)
      return {
        ...state,
        signals: prependLimited<Signal>(state.signals, message.data, 50),
      }
    case 'anomaly':
      store.ingestAnomaly(message.data as Anomaly)
      return {
        ...state,
        anomalies: prependLimited<Anomaly>(state.anomalies, message.data, 20),
      }
    case 'attribution':
      store.ingestAttribution(message.data as Attribution)
      return {
        ...state,
        attributions: prependLimited<Attribution>(
          state.attributions,
          message.data,
          20,
        ),
      }
    case 'decision':
      store.ingestDecision(message.data as Decision)
      return {
        ...state,
        decisions: prependLimited<Decision>(state.decisions, message.data, 20),
      }
    case 'ui_event':
      store.ingestUIEvent(message.data as UIEvent)
      return {
        ...state,
        uiEvents: prependLimited<UIEvent>(state.uiEvents, message.data, 20),
      }
    case 'operator_action':
      return state
    case 'trace':
      store.ingestTrace(message.data as ReasoningTrace)
      return {
        ...state,
        traces: [...state.traces, message.data as ReasoningTrace].slice(-500),
      }
    case 'embedding':
      store.ingestEmbeddingSnapshot(message.data as OsintEmbeddingSnapshot)
      // Embedding snapshots replace wholesale; we don't keep a history
      // because each one carries the full sliding window.
      return state
  }
}

export function useCokeZeroSocket(url: string | null = DEFAULT_URL) {
  const [state, setState] = useState<CokeZeroSocketState>(initialState)

  useEffect(() => {
    let demoTimer: number | null = null
    let fallbackTimer: number | null = null
    let socket: WebSocket | null = null
    let cancelled = false
    let staticDemoStarted = false
    let connected = false

    const startStaticDemo = () => {
      if (cancelled) return
      if (!STATIC_DEMO_ENABLED) {
        setGlobalConnection('offline')
        return
      }
      if (staticDemoStarted) return
      staticDemoStarted = true
      setGlobalConnection('fixture')
      const messages = createStaticDemoMessages()
      let index = 0

      const tick = () => {
        if (cancelled || index >= messages.length) return
        const message = messages[index]
        index += 1
        setState((current) => reduceMessage(current, message))
        demoTimer = window.setTimeout(tick, STATIC_DEMO_TICK_MS)
      }

      tick()
    }

    if (!url) {
      startStaticDemo()
      return () => {
        cancelled = true
        if (demoTimer !== null) window.clearTimeout(demoTimer)
      }
    }

    setGlobalConnection('connecting')
    void loadMissionMemory().then((memory) => {
      if (memory) {
        useEventStore
          .getState()
          .hydrateOperatorMemory(memory.state.operator_actions)
      }
    })

    fallbackTimer = window.setTimeout(() => {
      if (!connected) {
        try {
          socket?.close()
        } catch {
          // ignored
        }
        startStaticDemo()
      }
    }, STATIC_DEMO_FALLBACK_MS)

    socket = new WebSocket(url)

    socket.addEventListener('open', () => {
      connected = true
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer)
        fallbackTimer = null
      }
      setGlobalConnection('live')
      setState((current) => ({
        ...current,
        isConnected: true,
        lastError: null,
      }))
    })

    socket.addEventListener('close', () => {
      connected = false
      setState((current) => ({
        ...current,
        isConnected: false,
      }))
      if (!cancelled && STATIC_DEMO_ENABLED) {
        startStaticDemo()
      }
    })

    socket.addEventListener('error', () => {
      if (!STATIC_DEMO_ENABLED) setGlobalConnection('offline')
      setState((current) => ({
        ...current,
        lastError: 'coke-zero socket error',
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
          lastError: 'Invalid coke-zero socket payload',
        }))
      }
    })

    return () => {
      cancelled = true
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer)
      if (demoTimer !== null) window.clearTimeout(demoTimer)
      socket?.close()
    }
  }, [url])

  return state
}
