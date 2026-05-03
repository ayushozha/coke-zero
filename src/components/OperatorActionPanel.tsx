import { useEventStore } from '../store/eventStore'

const ACTION_LABELS: Record<string, string> = {
  active_defense_escort: 'Active defense escort',
  active_defense_counterattack: 'Active defense counterattack',
  orbital_strike_request: 'Orbital strike request',
  terrestrial_strike_request: 'Terrestrial strike request',
  space_link_interdiction_request: 'Space-link interdiction',
  sda_tasking: 'SDA tasking',
  threat_warning: 'Threat warning',
  passive_defense: 'Passive defense',
}

const formatAction = (action: string) =>
  ACTION_LABELS[action] ??
  action
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

/** Operator-facing review surface for the latest decide-stage output.
 *  Lives in the left rail under the scenario list. When the engine
 *  produces a Decision, the operator can ACCEPT (authorize the action)
 *  or DENY (refuse it). Status persists per-decision via Zustand. */
export function OperatorActionPanel() {
  const decision = useEventStore((s) => s.decisions[0] ?? null)
  const accepted = useEventStore((s) =>
    decision ? s.acceptedDecisionIds.has(decision.id) : false,
  )
  const deferred = useEventStore((s) =>
    decision ? s.deferredDecisionIds.has(decision.id) : false,
  )
  const acceptDecision = useEventStore((s) => s.acceptDecision)
  const deferDecision = useEventStore((s) => s.deferDecision)
  const clearDecisionStatus = useEventStore((s) => s.clearDecisionStatus)

  // Render nothing until the engine produces a decision. The empty
  // space stays empty rather than carrying placeholder chrome — the
  // panel only takes screen real estate once it has something
  // actionable to show.
  if (!decision) {
    return null
  }

  const status: 'accepted' | 'denied' | 'pending' = accepted
    ? 'accepted'
    : deferred
      ? 'denied'
      : 'pending'

  return (
    <section
      className={`operator-action operator-action--${status}`}
      aria-labelledby="operator-action-title"
    >
      <header className="operator-action__head">
        <span className="operator-action__eyebrow">Engine recommendation</span>
        <h2 id="operator-action-title">{formatAction(decision.action)}</h2>
      </header>

      <dl className="operator-action__meta">
        <div>
          <dt>Authority</dt>
          <dd>{decision.authority}</dd>
        </div>
        <div>
          <dt>Target</dt>
          <dd>{decision.target}</dd>
        </div>
      </dl>

      <p className="operator-action__rationale">{decision.rationale}</p>

      {status === 'pending' ? (
        <div className="operator-action__buttons" role="group">
          <button
            type="button"
            className="operator-action__btn operator-action__btn--accept"
            onClick={() => acceptDecision(decision.id)}
          >
            Accept
          </button>
          <button
            type="button"
            className="operator-action__btn operator-action__btn--deny"
            onClick={() => deferDecision(decision.id)}
          >
            Deny
          </button>
        </div>
      ) : (
        <div className="operator-action__resolved">
          <span className="operator-action__resolved-tag">
            {status === 'accepted' ? 'Accepted' : 'Denied'}
          </span>
          <button
            type="button"
            className="operator-action__btn operator-action__btn--undo"
            onClick={() => clearDecisionStatus(decision.id)}
          >
            Reconsider
          </button>
        </div>
      )}
    </section>
  )
}
