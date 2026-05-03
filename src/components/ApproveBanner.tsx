import type { Decision, UIEvent } from '../types/canopy'

type ApproveBannerProps = {
  decision: Decision | null
  uiEvent?: UIEvent | null
  isApproved: boolean
  onApprove: () => void
}

export function ApproveBanner({
  decision,
  uiEvent = null,
  isApproved,
  onApprove,
}: ApproveBannerProps) {
  const recommendation = uiEvent?.recommendation

  if (!recommendation && (!decision || decision.authority !== 'request')) {
    return null
  }

  const title = recommendation?.summary ?? decision?.action ?? 'Review request'
  const requestId = recommendation?.id ?? decision?.id ?? 'pending'
  const rationale = uiEvent?.message ?? decision?.rationale ?? ''
  const target = decision?.target ?? 'higher-authority review'
  const approveLabel = recommendation?.approveLabel ?? 'Approve'

  return (
    <section className="approve-banner" aria-label="Approval request">
      <div>
        <span className="approve-banner__kicker">Decision Gate</span>
        <h2>{title}</h2>
        <p>Target: {target}</p>
        <details className="details-panel details-panel--compact">
          <summary>
            <span>Approval basis</span>
            <span>{requestId}</span>
          </summary>
          <p>{rationale}</p>
        </details>
      </div>
      <button
        className="approve-banner__button"
        type="button"
        onClick={onApprove}
        disabled={isApproved}
      >
        {isApproved ? 'Approved' : approveLabel}
      </button>
    </section>
  )
}
