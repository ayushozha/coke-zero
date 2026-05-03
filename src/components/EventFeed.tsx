import type { Signal } from '../types/canopy'
import { commanderSignalSummary } from '../lib/commanderLanguage'

type EventFeedProps = {
  signals: Signal[]
}

export function EventFeed({ signals }: EventFeedProps) {
  const latestSignal = signals[0] ?? null
  const latestSummary = latestSignal
    ? commanderSignalSummary(latestSignal)
    : null
  const latestConfidence = latestSignal?.confidence ?? 0
  const feedState =
    latestConfidence >= 0.86
      ? 'PRIORITY'
      : latestConfidence >= 0.74
        ? 'WATCH'
        : 'MONITOR'

  return (
    <section className="event-feed" aria-label="Incoming signals">
      <div className="event-feed__header">
        <div>
          <span>ISR / EW / CSM</span>
          <h2>Signal Stream</h2>
        </div>
        {latestSignal && latestSummary ? (
          <div className="event-feed__update-cue" key={latestSignal.id}>
            <span>New report</span>
            <strong>{latestSummary.label}</strong>
          </div>
        ) : null}
        <div className="event-feed__status">
          <span>{feedState}</span>
          <strong>{signals.length.toString().padStart(2, '0')}</strong>
        </div>
      </div>
      <div
        className="event-feed__stream"
        role="log"
        aria-label="Live signal stream"
        aria-live="polite"
      >
        {signals.slice(0, 10).map((signal, index) => {
          const summary = commanderSignalSummary(signal)
          const priority =
            signal.confidence >= 0.86
              ? 'high'
              : signal.confidence >= 0.74
                ? 'watch'
                : 'low'
          return (
            <article
              className={`event-feed__entry event-feed__entry--${priority}`}
              data-newest={index === 0 ? 'true' : undefined}
              key={signal.id}
            >
              <div className="event-feed__entry-top">
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
              <div className="event-feed__meaning">
                <strong>{summary.headline}</strong>
                <p>{summary.whyItMatters}</p>
              </div>
              <div className="event-feed__entry-meta">
                <span>{summary.location}</span>
                <span>{summary.action}</span>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
