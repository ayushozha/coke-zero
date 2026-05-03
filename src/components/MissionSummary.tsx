import type { Attribution, Decision, UIEvent } from '../types/canopy'

type MissionSummaryProps = {
  attribution: Attribution | null
  decision: Decision | null
  uiEvent?: UIEvent | null
  signalCount: number
}

export function MissionSummary({
  attribution,
  decision,
  uiEvent = null,
  signalCount,
}: MissionSummaryProps) {
  const confidence = uiEvent
    ? `${Math.round(uiEvent.confidence * 100)}%`
    : attribution
      ? `${Math.round(attribution.confidence * 100)}%`
      : '--'
  const state =
    uiEvent?.severity === 'critical' || uiEvent?.severity === 'high'
      ? 'Red'
      : uiEvent?.severity === 'medium' || attribution
        ? 'Amber'
        : 'White'
  const headline = uiEvent?.title ?? attribution?.actor ?? 'Correlating'
  const summary =
    uiEvent?.message ??
    attribution?.predicted_next ??
    'Awaiting attribution package'
  const action =
    uiEvent?.recommendation?.summary ??
    decision?.action ??
    'No commander action pending'

  return (
    <section className="mission-summary" aria-label="Mission summary">
      <div className="mission-summary__status">
        <span>Threat State</span>
        <strong>{state}</strong>
      </div>
      <div className="mission-summary__main">
        <p className="mission-summary__kicker">
          {signalCount.toString().padStart(2, '0')} signals fused / {confidence}{' '}
          attribution
        </p>
        <h2>{headline}</h2>
        <p>{summary}</p>
      </div>
      <div className="mission-summary__action">
        <span>Recommended Action</span>
        <strong>{action}</strong>
      </div>
    </section>
  )
}
