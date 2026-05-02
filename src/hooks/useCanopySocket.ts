import { useEffect, useState } from 'react'
import type {
  Anomaly,
  Attribution,
  CanopyMessage,
  CanopySocketState,
  Decision,
  Signal,
} from '../types/canopy'

export const MOCK_URL: string | null = null

const initialState: CanopySocketState = {
  signals: [],
  anomalies: [],
  attributions: [],
  decisions: [],
  isConnected: false,
  lastError: null,
}

const prependLimited = <T,>(items: T[], next: T, limit: number) =>
  [next, ...items].slice(0, limit)

function isCanopyMessage(value: unknown): value is CanopyMessage {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as { type?: unknown; data?: unknown }
  return (
    typeof candidate.type === 'string' &&
    ['signal', 'anomaly', 'attribution', 'decision'].includes(candidate.type) &&
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
  }
}

export function useCanopySocket(url: string | null = MOCK_URL) {
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
