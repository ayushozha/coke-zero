import type { Decision, UIEvent } from '../types/coke_zero'
import { RequestPacketSummary } from './RequestPacketSummary'

type ApproveBannerProps = {
  decision: Decision | null
  uiEvent?: UIEvent | null
  onApprove: (id: string) => void
  onDismiss?: (id: string) => void
}

export function ApproveBanner({
  decision,
  uiEvent = null,
  onApprove,
  onDismiss,
}: ApproveBannerProps) {
  const recommendation = uiEvent?.recommendation

  if (!recommendation && (!decision || decision.authority !== 'request')) {
    return null
  }

  const title = recommendation?.summary ?? decision?.action ?? 'Review request'
  const requestId = recommendation?.id ?? decision?.id ?? 'pending'
  const approvalId = uiEvent?.id ?? decision?.id ?? requestId
  const rationale = uiEvent?.message ?? decision?.rationale ?? ''
  const target = decision?.target ?? 'higher-authority review'
  const approveLabel = recommendation?.approveLabel ?? 'Approve'

  return (
    <section className="approve-banner" aria-label="Approval request">
      <div>
        <span className="approve-banner__kicker">Decision Gate</span>
        <h2>{title}</h2>
        <p>Target: {target}</p>
        <dl className="approve-banner__meta">
          <div>
            <dt>Authority</dt>
            <dd>{decision?.authority ?? 'request'}</dd>
          </div>
          <div>
            <dt>Request</dt>
            <dd>{requestId}</dd>
          </div>
        </dl>
        <details className="details-panel details-panel--compact">
          <summary>
            <span>Approval basis</span>
            <span>{requestId}</span>
          </summary>
          <p>{rationale}</p>
        </details>
        {decision?.request_packet ? (
          <RequestPacketSummary compact packet={decision.request_packet} />
        ) : null}
      </div>
      <div className="approve-banner__actions">
        {onDismiss ? (
          <button
            className="approve-banner__button approve-banner__button--secondary"
            type="button"
            onClick={() => onDismiss(approvalId)}
          >
            Dismiss
          </button>
        ) : null}
        <button
          className="approve-banner__button"
          type="button"
          onClick={() => onApprove(approvalId)}
        >
          {approveLabel}
        </button>
      </div>
    </section>
  )
}
