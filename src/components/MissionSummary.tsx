import type { Attribution, Decision } from '../types/canopy'

type MissionSummaryProps = {
  attribution: Attribution | null
  decision: Decision | null
  signalCount: number
}

export function MissionSummary({
  attribution,
  decision,
  signalCount,
}: MissionSummaryProps) {
  const confidence = attribution
    ? `${Math.round(attribution.confidence * 100)}%`
    : '--'
  const actor = attribution?.actor ?? 'Correlating'
  const nextMove = attribution?.predicted_next ?? 'Awaiting attribution package'
  const action = decision?.action ?? 'No commander action pending'

  return (
    <section className="mission-summary" aria-label="Mission summary">
      <div className="mission-summary__status">
        <span>Threat State</span>
        <strong>{attribution ? 'Red' : 'White'}</strong>
      </div>
      <div className="mission-summary__main">
        <p className="mission-summary__kicker">
          {signalCount.toString().padStart(2, '0')} signals fused / {confidence}{' '}
          attribution
        </p>
        <h2>{actor}</h2>
        <p>{nextMove}</p>
      </div>
      <div className="mission-summary__action">
        <span>Recommended Action</span>
        <strong>{action}</strong>
      </div>
    </section>
  )
}
