import type { Attribution, Decision, UIEvent } from '../types/canopy'
import { commanderEventSummary } from '../lib/commanderLanguage'

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
  const commanderBrief = commanderEventSummary(uiEvent)
  const state = uiEvent
    ? commanderBrief.state
    : attribution
      ? 'Amber'
      : commanderBrief.state
  const headline = uiEvent
    ? commanderBrief.headline
    : attribution
      ? `${attribution.actor} pattern under review`
      : commanderBrief.headline
  const summary = uiEvent
    ? commanderBrief.body
    : attribution?.predicted_next ?? commanderBrief.body
  const action = uiEvent
    ? commanderBrief.action
    : decision?.action ?? commanderBrief.action
  const stateClass = state.toLowerCase()

  return (
    <section
      className={`mission-summary mission-summary--${stateClass}`}
      aria-label="Mission summary"
    >
      <div className="mission-summary__topline">
        <span>Posture</span>
        <strong>{state}</strong>
      </div>
      <div className="mission-summary__main">
        <p className="mission-summary__kicker">
          {signalCount.toString().padStart(2, '0')} reports fused / {confidence}{' '}
          confidence / {commanderBrief.urgency}
        </p>
        <h2>{headline}</h2>
        <p>{summary}</p>
      </div>
      <div className="mission-summary__action">
        <span>Commander action</span>
        <strong>{action}</strong>
      </div>
    </section>
  )
}
