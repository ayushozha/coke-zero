import type {
  Decision,
  MissionMemorySnapshot,
  OperatorActionPayload,
  OperatorActionStatus,
  UIEvent,
} from '../types/coke_zero'
import { COKE_ZERO_API_URL } from './runtimeConfig'

const API_URL = COKE_ZERO_API_URL

const WATCH_SIGNAL_DELIMITER = '__watch_'

function normalize(value: unknown): string {
  if (value == null) return ''
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ')
}

function baseSignalId(signalId: string): string {
  return signalId.split(WATCH_SIGNAL_DELIMITER, 1)[0]
}

function baseSignalIds(ids: string[] = []): string[] {
  return [...ids.map(baseSignalId)].sort()
}

function signature(kind: string, parts: unknown[]): string {
  return [kind, ...parts.map(normalize)].join('|')
}

export function uiEventMemorySignature(event: UIEvent): string {
  return signature('ui_event', [
    event.type,
    event.title,
    event.recommendation?.summary ?? '',
    baseSignalIds(event.source_signal_ids ?? []).join(','),
  ])
}

export function decisionMemorySignature(decision: Decision): string {
  return signature('decision', [
    decision.action,
    decision.target,
    baseSignalIds(decision.source_signal_ids ?? []).join(','),
  ])
}

export async function loadMissionMemory(): Promise<MissionMemorySnapshot | null> {
  if (!API_URL) return null
  try {
    const response = await fetch(`${API_URL}/memory`)
    if (!response.ok) return null
    return (await response.json()) as MissionMemorySnapshot
  } catch {
    return null
  }
}

export async function recordOperatorAction(
  payload: OperatorActionPayload,
): Promise<void> {
  if (!API_URL) return
  try {
    await fetch(`${API_URL}/memory/operator-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    // Local UI state still updates; the backend trace will make persistence
    // visible when the gateway is available.
  }
}

export function uiEventOperatorAction(
  event: UIEvent,
  status: OperatorActionStatus,
  decision?: Decision | null,
): OperatorActionPayload {
  return {
    status,
    subject_kind: 'ui_event',
    subject_signature: uiEventMemorySignature(event),
    event_id: event.id,
    event_type: event.type,
    recommendation_id: event.recommendation?.id ?? null,
    decision_id: decision?.id ?? null,
    title: event.title,
    summary: event.recommendation?.summary ?? event.message,
    action: decision?.action ?? null,
    target: decision?.target ?? null,
    source_signal_ids: event.source_signal_ids ?? decision?.source_signal_ids ?? [],
  }
}

export function decisionOperatorAction(
  decision: Decision,
  status: OperatorActionStatus,
): OperatorActionPayload {
  return {
    status,
    subject_kind: 'decision',
    subject_signature: decisionMemorySignature(decision),
    decision_id: decision.id,
    action: decision.action,
    target: decision.target,
    summary: decision.rationale,
    source_signal_ids: decision.source_signal_ids ?? [],
  }
}
