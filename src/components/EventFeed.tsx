import { useEffect, useState } from 'react'
import type { Signal } from '../types/canopy'
import { commanderSignalSummary } from '../lib/commanderLanguage'
import type { PlaybackStatus } from '../types/playback'

type EventFeedProps = {
  playback: PlaybackStatus | null
  signals: Signal[]
}

const SIGNAL_STREAM_UPDATE_MS = 5000

export function EventFeed({ signals }: EventFeedProps) {
  const [visibleSignals, setVisibleSignals] = useState(signals)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setVisibleSignals(signals)
    }, SIGNAL_STREAM_UPDATE_MS)

    return () => window.clearInterval(timer)
  }, [signals])

  const feedState =
    visibleSignals[0]?.confidence >= 0.86
      ? 'PRIORITY'
      : visibleSignals[0]?.confidence >= 0.74
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
          <strong>{visibleSignals.length.toString().padStart(2, '0')}</strong>
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
        {visibleSignals.slice(0, 10).map((signal, index) => {
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
              title={`${summary.oneLine} / ${summary.sourceLabel} / ${summary.location}`}
            >
              <span className="event-feed__time">
                {new Date(signal.ts).toLocaleTimeString([], {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span className="event-feed__domain">{summary.label}</span>
              <strong className="event-feed__message">
                {summary.oneLine}
              </strong>
              <span className="event-feed__confidence">
                {Math.round(signal.confidence * 100)}%
              </span>
            </article>
          )
        })}
      </div>
    </section>
  )
}
