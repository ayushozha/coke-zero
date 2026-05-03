import { useMemo } from 'react'
import type { Domain, Signal, UIEvent } from '../types/canopy'
import type { StatusState } from '../components/StatusCard'

type MissionStatus = {
  title: string
  label: string
  state: StatusState
  metric: string
  detail: string
}

export type CanopyMissionState = {
  threatState: StatusState
  statuses: {
    spaceLayer: MissionStatus
    attribution: MissionStatus
    blosComms: MissionStatus
  }
  correlatedSignalIds: string[]
  mapFocusSignalId: string | null
  latestSignal: Signal | null
  latestUiEvent: UIEvent | null
}

const spaceDomains = new Set<Domain>(['orbit', 'sda'])
const commsDomains = new Set<Domain>([
  'satcom',
  'rf_ew',
  'cyber',
  'pnt',
  'drone',
])

const stateFromConfidence = (confidence: number | null): StatusState => {
  if (confidence === null) {
    return 'white'
  }
  if (confidence >= 0.86) {
    return 'red'
  }
  if (confidence >= 0.72) {
    return 'amber'
  }
  return 'white'
}

const stateFromUiEvent = (event: UIEvent | null): StatusState => {
  if (!event) {
    return 'white'
  }
  if (event.severity === 'critical' || event.severity === 'high') {
    return 'red'
  }
  if (event.severity === 'medium') {
    return 'amber'
  }
  return 'white'
}

const strongerState = (a: StatusState, b: StatusState): StatusState => {
  const rank = { white: 0, amber: 1, red: 2 }
  return rank[a] >= rank[b] ? a : b
}

const statusForSignals = (
  signals: Signal[],
  domains: Set<Domain>,
  title: string,
  label: string,
  emptyDetail: string,
  correlatedSignalIds: Set<string>,
): MissionStatus => {
  const domainSignals = signals.filter((signal) => domains.has(signal.domain))
  const latest = domainSignals[0] ?? null
  const highestConfidence = domainSignals.reduce<number | null>(
    (highest, signal) =>
      highest === null ? signal.confidence : Math.max(highest, signal.confidence),
    null,
  )
  const hasCorrelation = domainSignals.some((signal) =>
    correlatedSignalIds.has(signal.id),
  )
  const state = strongerState(
    stateFromConfidence(highestConfidence),
    hasCorrelation ? 'amber' : 'white',
  )

  return {
    title,
    label,
    state,
    metric: latest
      ? `${Math.round((highestConfidence ?? latest.confidence) * 100)}% / ${domainSignals.length} live`
      : 'No live hits',
    detail: latest
      ? `${latest.domain.toUpperCase()} ${latest.payload.summary}`
      : emptyDetail,
  }
}

export function useCanopyMissionState(
  signals: Signal[],
  uiEvents: UIEvent[],
): CanopyMissionState {
  return useMemo(() => {
    const latestUiEvent = uiEvents[0] ?? null
    const correlatedSignalIds = new Set(latestUiEvent?.source_signal_ids ?? [])
    const latestSignal = signals[0] ?? null
    const correlatedSignal =
      signals.find((signal) => correlatedSignalIds.has(signal.id)) ?? null
    const mapFocusSignal = correlatedSignal ?? latestSignal
    const attributionState = stateFromUiEvent(latestUiEvent)

    return {
      threatState: attributionState,
      statuses: {
        spaceLayer: statusForSignals(
          signals,
          spaceDomains,
          'Space Layer',
          'Orbit / SDA',
          'No orbital or SDA signal has arrived.',
          correlatedSignalIds,
        ),
        attribution: {
          title: 'Attribution',
          label: latestUiEvent?.type.replaceAll('_', ' ') ?? 'Fusion',
          state: attributionState,
          metric: latestUiEvent
            ? `${Math.round(latestUiEvent.confidence * 100)}% confidence`
            : 'Awaiting package',
          detail: latestUiEvent?.title ?? 'No commander-facing event yet.',
        },
        blosComms: statusForSignals(
          signals,
          commsDomains,
          'BLOS Comms',
          'SATCOM / RF / PNT',
          'No degraded communications signal has arrived.',
          correlatedSignalIds,
        ),
      },
      correlatedSignalIds: [...correlatedSignalIds],
      mapFocusSignalId: mapFocusSignal?.id ?? null,
      latestSignal,
      latestUiEvent,
    }
  }, [signals, uiEvents])
}
