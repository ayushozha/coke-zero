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
          <h2>What Changed</h2>
        </div>
        <strong>{signals.length.toString().padStart(2, '0')} live</strong>
      </div>
      <ol className="event-feed__list">
        {signals.slice(0, 8).map((signal) => {
          const summary = commanderSignalSummary(signal)
          return (
            <li className="event-feed__item" key={signal.id}>
              <div className="event-feed__meta">
                <span className="event-feed__time">
                  {new Date(signal.ts).toLocaleTimeString([], {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="event-feed__domain">{summary.label}</span>
                <span className="event-feed__confidence">
                  {summary.confidenceLabel}
                </span>
              </div>
              <div className="event-feed__body">
                <h3>{summary.headline}</h3>
                <p>{summary.detail}</p>
                <dl>
                  <div>
                    <dt>Where</dt>
                    <dd>{summary.location}</dd>
                  </div>
                  <div>
                    <dt>Why it matters</dt>
                    <dd>{summary.whyItMatters}</dd>
                  </div>
                  <div>
                    <dt>Commander cue</dt>
                    <dd>{summary.action}</dd>
                  </div>
                </dl>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
