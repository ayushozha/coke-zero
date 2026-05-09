import { useMemo } from 'react'
import { ActionLog } from '../components/ActionLog'
import { DecisionLoopPanel } from '../components/DecisionLoopPanel'
import { EmbeddingViz } from '../components/EmbeddingViz'
import { OperatorActionPanel } from '../components/OperatorActionPanel'
import { ReasoningPanel } from '../components/ReasoningPanel'
import { RequestPacketSummary } from '../components/RequestPacketSummary'
import { useCokeZeroSocket } from '../hooks/useCokeZeroSocket'
import {
  decisionMemorySignature,
  uiEventMemorySignature,
} from '../lib/missionMemory'
import { useEventStore } from '../store/eventStore'
import type { Decision, OperatorActionStatus, UIEvent } from '../types/coke_zero'

const formatPercent = (value: number) => `${Math.round(value * 100)}%`

const formatAction = (action: string) =>
  action
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

const statusForDecision = (
  decision: Decision,
  acceptedDecisionIds: Set<string>,
  deferredDecisionIds: Set<string>,
  operatorMemoryBySignature: Record<string, OperatorActionStatus>,
) => {
  if (acceptedDecisionIds.has(decision.id)) return 'approved'
  if (deferredDecisionIds.has(decision.id)) return 'denied'
  return operatorMemoryBySignature[decisionMemorySignature(decision)] ?? 'pending'
}

const statusForRecommendation = (
  event: UIEvent,
  approvedEventIds: Set<string>,
  operatorMemoryBySignature: Record<string, OperatorActionStatus>,
) => {
  if (approvedEventIds.has(event.id)) return 'approved'
  return operatorMemoryBySignature[uiEventMemorySignature(event)] ?? 'pending'
}

export function Operator() {
  // Open the same WebSocket Brigade uses so live engine output streams
  // into the global event store while the operator is on this page.
  useCokeZeroSocket()

  const signals = useEventStore((s) => s.signals)
  const anomalies = useEventStore((s) => s.anomalies)
  const attributions = useEventStore((s) => s.attributions)
  const decisions = useEventStore((s) => s.decisions)
  const uiEvents = useEventStore((s) => s.uiEvents)
  const approvedEventIds = useEventStore((s) => s.approvedEventIds)
  const acceptedDecisionIds = useEventStore((s) => s.acceptedDecisionIds)
  const deferredDecisionIds = useEventStore((s) => s.deferredDecisionIds)
  const operatorMemoryBySignature = useEventStore(
    (s) => s.operatorMemoryBySignature,
  )
  const recommendations = useMemo(
    () =>
      uiEvents.filter(
        (event) =>
          event.type === 'recommendation_created' && event.recommendation,
      ),
    [uiEvents],
  )
  const latestAttribution = attributions[0] ?? null

  return (
    <main className="operator-shell">
      <header className="app-header">
        <div>
          <p className="app-header__eyebrow">coke-zero / Operator</p>
          <h1>Fusion Console</h1>
        </div>
        <a href="/brigade">Brigade View</a>
      </header>
      <section className="operator-grid" aria-label="Operator fusion state">
        <DecisionLoopPanel />
        <div className="panel operator-panel--anomaly">
          <div className="panel__header">
            <h2>Anomaly Queue</h2>
            <span>{String(anomalies.length).padStart(2, '0')} open</span>
          </div>
          {anomalies.length === 0 ? (
            <p className="operator-shell__empty">No correlated patterns</p>
          ) : (
            <ul className="operator-list">
              {anomalies.map((anomaly) => (
                <li className="operator-list__item" key={anomaly.id}>
                  <div>
                    <span className="operator-list__kind">{anomaly.kind}</span>
                    <small>{anomaly.source_signal}</small>
                  </div>
                  <span className="operator-list__sev">
                    {formatPercent(anomaly.severity)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel operator-panel--decision">
          <div className="panel__header">
            <h2>Decision Rail</h2>
            <span>{String(decisions.length).padStart(2, '0')} routed</span>
          </div>
          <div className="operator-panel__body">
            <OperatorActionPanel />
            {recommendations.length ? (
              <section className="operator-queue">
                <h3>Recommendations</h3>
                <ul className="operator-list operator-list--compact">
                  {recommendations.slice(0, 4).map((event) => (
                    <li className="operator-list__item" key={event.id}>
                      <div>
                        <span className="operator-list__kind">
                          {event.recommendation?.summary ?? event.title}
                        </span>
                        <small>{event.title}</small>
                      </div>
                      <span className="operator-list__sev">
                        {statusForRecommendation(
                          event,
                          approvedEventIds,
                          operatorMemoryBySignature,
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {decisions.length === 0 ? (
              <p className="operator-shell__empty">No authority requests</p>
            ) : (
              <ul className="operator-list operator-list--decision">
                {decisions.map((decision) => (
                  <li className="operator-list__item" key={decision.id}>
                    <div>
                      <span className="operator-list__kind">
                        {formatAction(decision.action)}
                      </span>
                      <small>
                        {decision.authority} / {decision.target} /{' '}
                        {statusForDecision(
                          decision,
                          acceptedDecisionIds,
                          deferredDecisionIds,
                          operatorMemoryBySignature,
                        )}
                      </small>
                      {decision.request_packet ? (
                        <RequestPacketSummary
                          compact
                          packet={decision.request_packet}
                        />
                      ) : null}
                    </div>
                    <span className="operator-list__sev">
                      {decision.source_signal_ids.length} src
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="operator-shell__footer" aria-live="polite">
            {signals.length} signals streamed
          </div>
        </div>
        <div className="panel operator-panel--attribution">
          <div className="panel__header">
            <h2>Attribution</h2>
            <span>{String(attributions.length).padStart(2, '0')} actors</span>
          </div>
          {latestAttribution ? (
            <div className="operator-attribution">
              <strong>{latestAttribution.actor}</strong>
              <span>{formatPercent(latestAttribution.confidence)} confidence</span>
              <p>
                {latestAttribution.doctrine_match ??
                  latestAttribution.predicted_next ??
                  'Evidence reconciled across the anomaly chain.'}
              </p>
              <ul>
                {latestAttribution.evidence.slice(0, 3).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="operator-shell__empty">No attribution yet</p>
          )}
        </div>
        <ActionLog limit={20} />
        <EmbeddingViz />
        <ReasoningPanel />
      </section>
    </main>
  )
}
