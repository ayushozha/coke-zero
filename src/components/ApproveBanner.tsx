import type { Decision } from '../types/canopy'

type ApproveBannerProps = {
  decision: Decision | null
  isApproved: boolean
  onApprove: () => void
}

export function ApproveBanner({
  decision,
  isApproved,
  onApprove,
}: ApproveBannerProps) {
  if (!decision || decision.authority !== 'request') {
    return null
  }

  return (
    <section className="approve-banner" aria-label="Approval request">
      <div>
        <span className="approve-banner__kicker">Authority Request</span>
        <h2>{decision.action}</h2>
        <p>Target {decision.target}</p>
        <details className="details-panel details-panel--compact">
          <summary>
            <span>Request Packet</span>
            <span>{decision.id}</span>
          </summary>
          <p>{decision.rationale}</p>
        </details>
      </div>
      <button
        className="approve-banner__button"
        type="button"
        onClick={onApprove}
        disabled={isApproved}
      >
        {isApproved ? 'Approved' : 'Approve'}
      </button>
    </section>
  )
}
