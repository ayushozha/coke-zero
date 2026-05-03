import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Signal } from '../types/canopy'
import { commanderSignalSummary } from '../lib/commanderLanguage'

type EventFeedProps = {
  isMapAutoFocusEnabled?: boolean
  isLive?: boolean
  onToggleMapAutoFocus?: () => void
  signals: Signal[]
}

type FeedView = 'updates' | 'raw'

const RAW_SIGNAL_LIMIT = 30
const SPARKLINE_BUCKETS = 24
const ONE_MINUTE_MS = 60_000

const priorityForSignal = (signal: Signal) =>
  signal.confidence >= 0.86
    ? 'high'
    : signal.confidence >= 0.74
      ? 'watch'
      : 'low'

const signalEnvelope = (signal: Signal) => ({
  type: 'signal',
  data: signal,
})

const signalJson = (signal: Signal) =>
  JSON.stringify(signalEnvelope(signal), null, 2)

const formatTime = (ts: string, includeSeconds = false) =>
  new Date(ts).toLocaleTimeString([], {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: includeSeconds ? '2-digit' : undefined,
  })

const compactSource = (source: string) =>
  source
    .replace(/^brigade-/i, 'bde-')
    .replace(/^canopy-/i, 'canopy-')
    .replace(/controller/gi, 'ctrl')
    .replace(/commercial/gi, 'com')
    .replace(/\s+/g, '_')
    .toLowerCase()

const compactPayload = (signal: Signal) => {
  const eventType = signal.payload.event_type
  const asset = signal.payload.asset
  const summary = signal.payload.summary
  const fragments = [eventType, asset, summary].filter(Boolean)

  if (fragments.length) {
    return fragments.join(' | ')
  }

  return signal.source
}

const sparklineBuckets = (arrivalTimes: number[]) => {
  const now = Date.now()
  const bucketWidth = ONE_MINUTE_MS / SPARKLINE_BUCKETS
  const buckets = Array.from({ length: SPARKLINE_BUCKETS }, () => 0)

  arrivalTimes.forEach((arrivalTime) => {
    const age = now - arrivalTime
    if (age < 0 || age > ONE_MINUTE_MS) {
      return
    }

    const bucketIndex = Math.min(
      SPARKLINE_BUCKETS - 1,
      Math.floor(age / bucketWidth),
    )
    buckets[SPARKLINE_BUCKETS - 1 - bucketIndex] += 1
  })

  const peak = Math.max(1, ...buckets)
  return buckets.map((count) => Math.max(10, Math.round((count / peak) * 100)))
}

export function EventFeed({
  isMapAutoFocusEnabled = false,
  isLive = false,
  onToggleMapAutoFocus,
  signals,
}: EventFeedProps) {
  const [activeView, setActiveView] = useState<FeedView>('updates')
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null)
  const [arrivalTimes, setArrivalTimes] = useState<number[]>([])
  const arrivalTimesByIdRef = useRef<Map<string, number>>(new Map())
  const rawStreamRef = useRef<HTMLDivElement>(null)
  const latestSignalId = signals[0]?.id

  useEffect(() => {
    const now = Date.now()
    const signalIds = new Set(signals.map((signal) => signal.id))
    const arrivals = arrivalTimesByIdRef.current

    signals.forEach((signal) => {
      if (!arrivals.has(signal.id)) {
        arrivals.set(signal.id, now)
      }
    })

    arrivals.forEach((arrivalTime, signalId) => {
      if (now - arrivalTime > ONE_MINUTE_MS && !signalIds.has(signalId)) {
        arrivals.delete(signalId)
      }
    })

    setArrivalTimes(
      Array.from(arrivals.values()).filter(
        (arrivalTime) => now - arrivalTime <= ONE_MINUTE_MS,
      ),
    )
  }, [signals])

  useEffect(() => {
    if (activeView === 'raw') {
      rawStreamRef.current?.scrollTo({
        top: 0,
        behavior: 'smooth',
      })
    }
  }, [activeView, latestSignalId])

  const rawSignals = useMemo(
    () => signals.slice(0, RAW_SIGNAL_LIMIT),
    [signals],
  )
  const activeDomains = useMemo(
    () => new Set(signals.map((signal) => signal.domain)).size,
    [signals],
  )
  const eventRateBuckets = useMemo(
    () => sparklineBuckets(arrivalTimes),
    [arrivalTimes],
  )

  const feedState =
    signals[0]?.confidence >= 0.86
      ? 'PRIORITY'
      : signals[0]?.confidence >= 0.74
        ? 'WATCH'
        : 'MONITOR'
  const statusTone =
    activeView === 'raw'
      ? isLive
        ? 'live'
        : 'demo'
      : feedState.toLowerCase()

  return (
    <section className="event-feed" aria-label="Incoming signals">
      <div className="event-feed__header">
        <div>
          <span>ISR / EW / CSM</span>
          <h2>Signal Stream</h2>
        </div>
        <div className="event-feed__header-actions">
          <div
            className="event-feed__tabs"
            role="tablist"
            aria-label="Signal stream view"
          >
            <button
              className={
                activeView === 'updates'
                  ? 'event-feed__tab is-active'
                  : 'event-feed__tab'
              }
              onClick={() => setActiveView('updates')}
              role="tab"
              type="button"
              aria-selected={activeView === 'updates'}
            >
              Updates
            </button>
            <button
              className={
                activeView === 'raw'
                  ? 'event-feed__tab is-active'
                  : 'event-feed__tab'
              }
              onClick={() => setActiveView('raw')}
              role="tab"
              type="button"
              aria-selected={activeView === 'raw'}
            >
              Raw Tail
            </button>
          </div>
          {onToggleMapAutoFocus ? (
            <button
              className={
                isMapAutoFocusEnabled
                  ? 'event-feed__focus-toggle is-active'
                  : 'event-feed__focus-toggle'
              }
              onClick={onToggleMapAutoFocus}
              type="button"
              aria-pressed={isMapAutoFocusEnabled}
              title="Follow high-priority map events"
            >
              Map focus
            </button>
          ) : null}
          <div className={`event-feed__status event-feed__status--${statusTone}`}>
            <span>
              {activeView === 'raw'
                ? isLive
                  ? 'LIVE BUS'
                  : 'DEMO BUS'
                : feedState}
            </span>
            <strong>{signals.length.toString().padStart(2, '0')}</strong>
          </div>
        </div>
      </div>

      {activeView === 'updates' ? (
        <div
          className="event-feed__stream"
          role="log"
          aria-label="Live signal stream"
          aria-live="polite"
        >
          {signals.slice(0, 10).map((signal, index) => {
            const summary = commanderSignalSummary(signal)
            const priority = priorityForSignal(signal)
            return (
              <article
                className={`event-feed__entry event-feed__entry--${priority}`}
                data-newest={index === 0 ? 'true' : undefined}
                key={signal.id}
              >
                <div className="event-feed__entry-top">
                  <span className="event-feed__time">
                    {formatTime(signal.ts)}
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
      ) : (
        <div className="event-feed__raw-view">
          <div className="event-feed__bus-status">
            <span className="event-feed__live-dot" aria-hidden="true" />
            <span>canopy://bus</span>
            <span>signals.* topics</span>
            <span>{arrivalTimes.length} events/min</span>
            <span>{activeDomains} domains active</span>
            <strong>{isLive ? 'live' : 'demo'}</strong>
            <div
              className="event-feed__sparkline"
              aria-label="Event rate over the last minute"
            >
              {eventRateBuckets.map((height, index) => (
                <i
                  key={`${height}-${index}`}
                  style={{ '--bar-height': `${height}%` } as CSSProperties}
                />
              ))}
            </div>
          </div>
          <div
            className="event-feed__stream event-feed__stream--raw"
            ref={rawStreamRef}
            role="log"
            aria-label="Raw signal live tail"
            aria-live="polite"
          >
            {rawSignals.length ? (
              rawSignals.map((signal, index) => {
                const priority = priorityForSignal(signal)
                const isNewest = index === 0
                const isSelected = signal.id === selectedSignalId

                return (
                  <article
                    className={`event-feed__raw-entry event-feed__raw-entry--${priority}`}
                    data-newest={isNewest ? 'true' : undefined}
                    data-domain={signal.domain}
                    key={signal.id}
                  >
                    <button
                      className="event-feed__raw-row"
                      onClick={() =>
                        setSelectedSignalId(isSelected ? null : signal.id)
                      }
                      type="button"
                      aria-expanded={isSelected}
                    >
                      <span className="event-feed__raw-time">
                        {formatTime(signal.ts, true)}
                      </span>
                      <span className="event-feed__raw-domain">
                        {signal.domain}
                      </span>
                      <span className="event-feed__raw-source">
                        {compactSource(signal.source)}
                      </span>
                      <span className="event-feed__raw-payload">
                        {compactPayload(signal)}
                      </span>
                      <span className="event-feed__raw-confidence">
                        conf={signal.confidence.toFixed(2)}
                      </span>
                    </button>
                    {isSelected ? (
                      <pre className="event-feed__raw-detail">
                        <code>{signalJson(signal)}</code>
                      </pre>
                    ) : null}
                  </article>
                )
              })
            ) : (
              <p className="event-feed__empty">
                Waiting for signal envelopes...
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
