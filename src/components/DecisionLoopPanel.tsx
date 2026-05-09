import { useMemo } from 'react'
import {
  decisionMemorySignature,
  uiEventMemorySignature,
} from '../lib/missionMemory'
import { useEventStore } from '../store/eventStore'
import type {
  Attribution,
  Decision,
  OperatorActionStatus,
  Signal,
  UIEvent,
} from '../types/coke_zero'
import { CapabilityBackbone } from './CapabilityBackbone'
import { RequestPacketSummary } from './RequestPacketSummary'

type DecisionLoopPanelProps = {
  compact?: boolean
  fallbackAttribution?: Attribution | null
  fallbackDecision?: Decision | null
  fallbackSignals?: Signal[]
  fallbackUiEvent?: UIEvent | null
}

type StepState = 'live' | 'waiting' | 'warn' | 'approved' | 'denied'

type StepRow = {
  detail: string
  label: string
  state: StepState
  value: string
}

const formatPercent = (value: number | undefined) =>
  typeof value === 'number' ? `${Math.round(value * 100)}%` : '--'

const formatAction = (action: string | undefined) =>
  action
    ? action
        .split(/[_\s]+/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    : 'No action drafted'

const toolName = (tracePayload: Record<string, unknown> | undefined) => {
  const tool = tracePayload?.tool
  return typeof tool === 'string' && tool ? tool : 'tools'
}

const recommendationStatus = (
  event: UIEvent | null,
  approvedEventIds: Set<string>,
  operatorMemoryBySignature: Record<string, OperatorActionStatus>,
) => {
  if (!event) return null
  if (approvedEventIds.has(event.id)) return 'approved'
  return operatorMemoryBySignature[uiEventMemorySignature(event)] ?? null
}

const decisionStatus = (
  decision: Decision | null,
  acceptedDecisionIds: Set<string>,
  deferredDecisionIds: Set<string>,
  operatorMemoryBySignature: Record<string, OperatorActionStatus>,
) => {
  if (!decision) return null
  if (acceptedDecisionIds.has(decision.id)) return 'approved'
  if (deferredDecisionIds.has(decision.id)) return 'denied'
  return operatorMemoryBySignature[decisionMemorySignature(decision)] ?? null
}

const approvalLabel = (
  decision: Decision | null,
  recommendation: UIEvent | null,
  decisionDisposition: OperatorActionStatus | null,
  recommendationDisposition: OperatorActionStatus | null,
) => {
  const disposition = decisionDisposition ?? recommendationDisposition
  if (disposition === 'approved') return 'Approved'
  if (disposition === 'denied') return 'Denied'
  if (disposition === 'dismissed') return 'Dismissed'
  if (decision?.authority === 'request' || recommendation) return 'Awaiting approval'
  if (decision) return 'Local action'
  return 'Watching'
}

const approvalState = (label: string): StepState => {
  if (label === 'Approved') return 'approved'
  if (label === 'Denied' || label === 'Dismissed') return 'denied'
  if (label === 'Awaiting approval') return 'warn'
  return 'waiting'
}

export function DecisionLoopPanel({
  compact = false,
  fallbackAttribution = null,
  fallbackDecision = null,
  fallbackSignals = [],
  fallbackUiEvent = null,
}: DecisionLoopPanelProps) {
  const storeSignals = useEventStore((s) => s.signals)
  const anomalies = useEventStore((s) => s.anomalies)
  const attributions = useEventStore((s) => s.attributions)
  const decisions = useEventStore((s) => s.decisions)
  const uiEvents = useEventStore((s) => s.uiEvents)
  const traces = useEventStore((s) => s.traces)
  const approvedEventIds = useEventStore((s) => s.approvedEventIds)
  const acceptedDecisionIds = useEventStore((s) => s.acceptedDecisionIds)
  const deferredDecisionIds = useEventStore((s) => s.deferredDecisionIds)
  const operatorMemoryBySignature = useEventStore(
    (s) => s.operatorMemoryBySignature,
  )

  const latestRecommendation = useMemo(
    () =>
      uiEvents.find(
        (event) =>
          event.type === 'recommendation_created' && event.recommendation,
      ) ??
      (fallbackUiEvent?.type === 'recommendation_created' &&
      fallbackUiEvent.recommendation
        ? fallbackUiEvent
        : null),
    [fallbackUiEvent, uiEvents],
  )
  const recommendationCount = useMemo(
    () =>
      uiEvents.filter(
        (event) =>
          event.type === 'recommendation_created' && event.recommendation,
      ).length,
    [uiEvents],
  )
  const toolTraces = useMemo(
    () => traces.filter((trace) => trace.stage === 'tools'),
    [traces],
  )

  const signals = storeSignals.length ? storeSignals : fallbackSignals
  const latestSignal = signals[0] ?? null
  const latestAnomaly = anomalies[0] ?? null
  const latestAttribution = attributions[0] ?? fallbackAttribution
  const requestDecision =
    decisions.find(
      (decision) => decision.authority === 'request' || decision.request_packet,
    ) ??
    (fallbackDecision?.authority === 'request' || fallbackDecision?.request_packet
      ? fallbackDecision
      : null)
  const latestDecision = requestDecision ?? decisions[0] ?? fallbackDecision
  const latestTool = toolTraces[toolTraces.length - 1] ?? null
  const decisionDisposition = decisionStatus(
    latestDecision,
    acceptedDecisionIds,
    deferredDecisionIds,
    operatorMemoryBySignature,
  )
  const recommendationDisposition = recommendationStatus(
    latestRecommendation,
    approvedEventIds,
    operatorMemoryBySignature,
  )
  const currentApprovalLabel = approvalLabel(
    latestDecision,
    latestRecommendation,
    decisionDisposition,
    recommendationDisposition,
  )
  const sourceIds = Array.from(
    new Set(
      latestDecision?.source_signal_ids ??
        latestAttribution?.source_signal_ids ??
        latestRecommendation?.source_signal_ids ??
        latestAnomaly?.source_signal_ids ??
        [],
    ),
  ).slice(0, compact ? 6 : 14)
  const stageRows: StepRow[] = [
    {
      detail: latestSignal
        ? `${latestSignal.domain} / ${latestSignal.source}`
        : 'No signal envelopes received',
      label: 'Signals',
      state: latestSignal ? 'live' : 'waiting',
      value: signals.length.toString().padStart(2, '0'),
    },
    {
      detail: latestAnomaly
        ? `${latestAnomaly.kind} from ${latestAnomaly.source_signal}`
        : 'No fused anomaly yet',
      label: 'Anomalies',
      state: latestAnomaly ? 'live' : 'waiting',
      value: latestAnomaly ? formatPercent(latestAnomaly.severity) : '00',
    },
    {
      detail: latestAttribution
        ? latestAttribution.doctrine_match ?? 'Attribution evidence reconciled'
        : 'No actor attribution yet',
      label: 'Attribution',
      state: latestAttribution ? 'live' : 'waiting',
      value: latestAttribution
        ? `${latestAttribution.actor} ${formatPercent(latestAttribution.confidence)}`
        : 'Pending',
    },
    {
      detail: latestTool?.message ?? 'No tool dispatch yet',
      label: 'Tool use',
      state: latestTool ? 'live' : 'waiting',
      value: latestTool ? toolName(latestTool.payload) : '0 calls',
    },
    {
      detail: latestDecision
        ? `${latestDecision.target} / ${latestDecision.rationale}`
        : 'No authority routing yet',
      label: 'Authority',
      state: latestDecision ? 'live' : 'waiting',
      value: latestDecision?.authority ?? 'Pending',
    },
    {
      detail:
        latestRecommendation?.recommendation?.summary ??
        latestRecommendation?.message ??
        'No recommendation surfaced',
      label: 'Recommendation',
      state: latestRecommendation ? 'warn' : 'waiting',
      value: latestRecommendation ? latestRecommendation.title : 'None',
    },
    {
      detail: latestDecision
        ? formatAction(latestDecision.action)
        : 'Operator has not received an action gate',
      label: 'Approval',
      state: approvalState(currentApprovalLabel),
      value: currentApprovalLabel,
    },
  ]

  return (
    <section
      className={`decision-loop${compact ? ' decision-loop--compact' : ''}`}
      aria-label="Operator-ready decision loop"
    >
      <div className="panel__header">
        <h2>Decision Loop</h2>
        <span
          className={`decision-loop__status decision-loop__status--${approvalState(
            currentApprovalLabel,
          )}`}
        >
          {currentApprovalLabel}
        </span>
      </div>
      {compact ? <CapabilityBackbone compact /> : null}
      <div className="decision-loop__metrics" aria-label="Decision loop counts">
        <div>
          <span>Signals</span>
          <strong>{signals.length}</strong>
        </div>
        <div>
          <span>Anomalies</span>
          <strong>{anomalies.length}</strong>
        </div>
        <div>
          <span>Tools</span>
          <strong>{toolTraces.length}</strong>
        </div>
        <div>
          <span>Recs</span>
          <strong>{recommendationCount}</strong>
        </div>
      </div>
      {!compact ? <CapabilityBackbone /> : null}
      {latestDecision?.request_packet ? (
        <RequestPacketSummary
          compact={compact}
          packet={latestDecision.request_packet}
        />
      ) : null}
      <div className="decision-loop__steps">
        {stageRows.map((row) => (
          <div
            className={`decision-loop__step decision-loop__step--${row.state}`}
            key={row.label}
          >
            <span className="decision-loop__dot" aria-hidden="true" />
            <div className="decision-loop__step-body">
              <div className="decision-loop__step-top">
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
              <p>{row.detail}</p>
            </div>
          </div>
        ))}
      </div>
      {sourceIds.length ? (
        <div className="decision-loop__sources" aria-label="Source signal chain">
          <span>Source chain</span>
          <div>
            {sourceIds.map((id) => (
              <code key={id}>{id}</code>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
