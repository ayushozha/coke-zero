import type { Signal } from '../types/canopy'

type EventFeedProps = {
  signals: Signal[]
}

const formatPayload = (payload: Signal['payload']) =>
  Object.entries(payload)
    .map(([key, value]) => `${key}:${String(value)}`)
    .join(' / ')

export function EventFeed({ signals }: EventFeedProps) {
  return (
    <details className="details-panel event-feed">
      <summary>
        <span>Incoming Signals</span>
        <span>{signals.length.toString().padStart(2, '0')} live</span>
      </summary>
      <ol className="event-feed__list">
        {signals.map((signal) => (
          <li className="event-feed__item" key={signal.id}>
            <span className="event-feed__time">
              {new Date(signal.ts).toLocaleTimeString([], {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
            <span className="event-feed__domain">{signal.domain}</span>
            <span className="event-feed__source">{signal.source}</span>
            <span className="event-feed__payload">
              {formatPayload(signal.payload)}
            </span>
            <span className="event-feed__confidence">
              {Math.round(signal.confidence * 100)}%
            </span>
          </li>
        ))}
      </ol>
    </details>
  )
}
