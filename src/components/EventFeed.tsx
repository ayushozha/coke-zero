import type { Signal } from '../types/canopy'
import { commanderSignalSummary } from '../lib/commanderLanguage'

type EventFeedProps = {
  signals: Signal[]
}

export function EventFeed({ signals }: EventFeedProps) {
  return (
    <section className="event-feed" aria-label="Incoming signals">
      <div className="event-feed__header">
        <div>
          <span>Incoming Reports</span>
          <h2>Signal Log</h2>
        </div>
        <strong>{signals.length.toString().padStart(2, '0')} live</strong>
      </div>
      <div className="event-feed__table" role="table" aria-label="Signal log">
        <div className="event-feed__row event-feed__row--head" role="row">
          <span>Time</span>
          <span>Feed</span>
          <span>Commander meaning</span>
          <span>Where</span>
          <span>Next action</span>
          <span>Confidence</span>
        </div>
        {signals.slice(0, 8).map((signal) => {
          const summary = commanderSignalSummary(signal)
          return (
            <div className="event-feed__row" key={signal.id} role="row">
              <span className="event-feed__time">
                {new Date(signal.ts).toLocaleTimeString([], {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span className="event-feed__domain">{summary.label}</span>
              <span className="event-feed__meaning">
                <strong>{summary.headline}</strong>
                <small>{summary.whyItMatters}</small>
              </span>
              <span>{summary.location}</span>
              <span>{summary.action}</span>
              <span className="event-feed__confidence">
                {summary.confidenceLabel}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
