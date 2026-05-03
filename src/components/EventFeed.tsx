import type { Signal } from '../types/canopy'
import { commanderSignalSummary } from '../lib/commanderLanguage'
import type { PlaybackStatus } from '../types/playback'

type EventFeedProps = {
  playback: PlaybackStatus | null
  signals: Signal[]
}

const formatDuration = (milliseconds: number) => {
  if (milliseconds > 0 && milliseconds < 60 * 1000) {
    return '<1M'
  }

  const totalMinutes = Math.max(0, Math.round(milliseconds / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours > 0) {
    return `${hours}H ${minutes.toString().padStart(2, '0')}M`
  }

  return `${minutes}M`
}

export function EventFeed({ playback, signals }: EventFeedProps) {
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
            <strong>{latestSummary.oneLine}</strong>
          </div>
        ) : null}
        <div className="event-feed__status">
          <span>{feedState}</span>
          <strong>{signals.length.toString().padStart(2, '0')}</strong>
        </div>
      </div>
      {playback ? (
        <div className="event-feed__clock">
          <span>MET {formatDuration(playback.elapsedMs)}</span>
          <span>
            {playback.nextInjectMs === null
              ? 'ENDEX hold'
              : `Next inject ${formatDuration(playback.nextInjectMs)}`}
          </span>
        </div>
      ) : null}
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
                <strong title={summary.oneLine}>{summary.oneLine}</strong>
                <p title={`${summary.sourceLabel} / ${summary.location}`}>
                  {summary.sourceLabel} / {summary.location}
                </p>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
