import { useEffect, useState } from 'react'
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
const DEV_BRIDGE_URL = 'ws://127.0.0.1:8000/ws/brigade'
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

function isCanopyMessage(value: unknown): value is CanopyMessage {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as { type?: unknown; data?: unknown }
  return (
    typeof candidate.type === 'string' &&
    ['signal', 'anomaly', 'attribution', 'decision', 'ui_event', 'trace'].includes(
      candidate.type,
    ) &&
    typeof candidate.data === 'object' &&
    candidate.data !== null
  )
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
        if (!isCanopyMessage(parsed)) {
          return
        }

        setState((current) => reduceMessage(current, parsed))
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
