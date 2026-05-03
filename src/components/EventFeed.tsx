import { useEffect, useState } from 'react'
import type { Signal } from '../types/canopy'
import { commanderSignalSummary } from '../lib/commanderLanguage'

type EventFeedProps = {
  isMapAutoFocusEnabled?: boolean
  isLive?: boolean
  onToggleMapAutoFocus?: () => void
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
  const flowFrame =
    flowFrames[
      Math.min(
        flowProgress.signalId === latestSignalId ? flowProgress.stepIndex : 0,
        flowFrames.length - 1,
      )
    ] ??
    idleDecisionFlow[0]
  const flowPriority = latestSignal ? priorityForSignal(latestSignal) : 'low'
  const flowHeadline = flowFrame.headline
  const flowDetail = flowFrame.detail
  const statusTone =
    activeView === 'raw'
      ? isLive
        ? 'live'
        : 'demo'
      : activeView === 'flow'
        ? 'flow'
        : feedState.toLowerCase()
  const statusLabel =
    activeView === 'raw'
      ? isLive
        ? 'LIVE BUS'
        : 'DEMO BUS'
      : activeView === 'flow'
        ? 'FLOW'
        : feedState
  const flowShapeClass = (node: FlowNodeId, shapeClass: string) =>
    [
      'event-flow__shape',
      shapeClass,
      flowFrame.completedNodes.includes(node) ? 'is-complete' : '',
      flowFrame.activeNode === node ? 'is-active' : '',
    ]
      .filter(Boolean)
      .join(' ')
  const flowTextClass = (node: FlowNodeId, textClass = 'event-flow__text') =>
    [
      textClass,
      flowFrame.completedNodes.includes(node) ? 'is-complete' : '',
      flowFrame.activeNode === node ? 'is-active' : '',
    ]
      .filter(Boolean)
      .join(' ')
  const flowEdgeClass = (edge: FlowEdgeId, edgeClass: string) =>
    [
      'event-flow__line',
      edgeClass,
      flowFrame.completedEdges.includes(edge) ? 'is-complete' : '',
      flowFrame.activeEdges.includes(edge) ? 'is-active' : '',
    ]
      .filter(Boolean)
      .join(' ')
  const flowEdgeLabelClass = (edge: FlowEdgeId) =>
    [
      'event-flow__edge-label',
      flowFrame.completedEdges.includes(edge) ? 'is-complete' : '',
      flowFrame.activeEdges.includes(edge) ? 'is-active' : '',
    ]
      .filter(Boolean)
      .join(' ')

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
            <button
              className={
                activeView === 'flow'
                  ? 'event-feed__tab is-active'
                  : 'event-feed__tab'
              }
              onClick={() => setActiveView('flow')}
              role="tab"
              type="button"
              aria-selected={activeView === 'flow'}
            >
              Flow
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
            <span>{statusLabel}</span>
            <strong>{signals.length.toString().padStart(2, '0')}</strong>
          </div>
        ) : null}
        <div className="event-feed__status">
          <span>{feedState}</span>
          <strong>{visibleSignals.length.toString().padStart(2, '0')}</strong>
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
              <defs>
                <marker
                  id="event-flow-arrow"
                  markerHeight="8"
                  markerWidth="8"
                  orient="auto"
                  refX="7"
                  refY="4"
                  viewBox="0 0 8 8"
                >
                  <path d="M0,0 L8,4 L0,8 Z" />
                </marker>
              </defs>

              <path
                className={flowEdgeClass('signal-schema', 'event-flow__line--top')}
                d="M150 64 H180"
                markerEnd="url(#event-flow-arrow)"
              />
              <path
                className={flowEdgeClass('schema-fuse', 'event-flow__line--top')}
                d="M290 64 H340"
                markerEnd="url(#event-flow-arrow)"
              />
              <path
                className={flowEdgeClass(
                  'fuse-confidence',
                  'event-flow__line--top',
                )}
                d="M530 64 H570"
                markerEnd="url(#event-flow-arrow)"
              />
              <path
                className={flowEdgeClass(
                  'confidence-draft',
                  'event-flow__line--top',
                )}
                d="M680 64 H730"
                markerEnd="url(#event-flow-arrow)"
              />
              <path
                className={flowEdgeClass(
                  'draft-commander',
                  'event-flow__line--top',
                )}
                d="M920 64 H980"
                markerEnd="url(#event-flow-arrow)"
              />

              <path
                className={flowEdgeClass(
                  'schema-hold',
                  'event-flow__line--branch',
                )}
                d="M235 114 V145 H340"
                markerEnd="url(#event-flow-arrow)"
              />
              <path
                className={flowEdgeClass(
                  'confidence-watch',
                  'event-flow__line--branch',
                )}
                d="M625 114 V145 H730"
                markerEnd="url(#event-flow-arrow)"
              />

              <text className={flowEdgeLabelClass('schema-fuse')} x="314" y="52">
                yes
              </text>
              <text
                className={flowEdgeLabelClass('confidence-draft')}
                x="705"
                y="52"
              >
                yes
              </text>
              <text className={flowEdgeLabelClass('schema-hold')} x="246" y="134">
                no
              </text>
              <text
                className={flowEdgeLabelClass('confidence-watch')}
                x="636"
                y="134"
              >
                no
              </text>

              <ellipse
                className={flowShapeClass('signal', 'event-flow__shape--start')}
                cx="80"
                cy="64"
                rx="70"
                ry="34"
              />
              <text className={flowTextClass('signal')} x="80" y="58">
                <tspan x="80">Signal</tspan>
                <tspan x="80" dy="18">
                  bus
                </tspan>
              </text>

              <polygon
                className={flowShapeClass(
                  'schema',
                  'event-flow__shape--decision',
                )}
                points="235,14 290,64 235,114 180,64"
              />
              <text className={flowTextClass('schema')} x="235" y="58">
                <tspan x="235">Schema</tspan>
                <tspan x="235" dy="18">
                  valid?
                </tspan>
              </text>

              <rect
                className={flowShapeClass('fuse', 'event-flow__shape--step')}
                height="64"
                rx="3"
                width="190"
                x="340"
                y="32"
              />
              <text className={flowTextClass('fuse')} x="435" y="58">
                <tspan x="435">Fuse</tspan>
                <tspan x="435" dy="18">
                  domains
                </tspan>
              </text>

              <polygon
                className={flowShapeClass(
                  'confidence',
                  'event-flow__shape--decision',
                )}
                points="625,14 680,64 625,114 570,64"
              />
              <text className={flowTextClass('confidence')} x="625" y="58">
                <tspan x="625">High</tspan>
                <tspan x="625" dy="18">
                  conf?
                </tspan>
              </text>

              <rect
                className={flowShapeClass(
                  'draft',
                  'event-flow__shape--step event-flow__shape--decide',
                )}
                height="64"
                rx="3"
                width="190"
                x="730"
                y="32"
              />
              <text className={flowTextClass('draft')} x="825" y="58">
                <tspan x="825">Draft</tspan>
                <tspan x="825" dy="18">
                  action
                </tspan>
              </text>

              <ellipse
                className={flowShapeClass('commander', 'event-flow__shape--end')}
                cx="1075"
                cy="64"
                rx="95"
                ry="34"
              />
              <text className={flowTextClass('commander')} x="1075" y="58">
                <tspan x="1075">Commander</tspan>
                <tspan x="1075" dy="18">
                  update
                </tspan>
              </text>

              <rect
                className={flowShapeClass('hold', 'event-flow__shape--hold')}
                height="40"
                rx="3"
                width="190"
                x="340"
                y="124"
              />
              <text
                className={flowTextClass(
                  'hold',
                  'event-flow__text event-flow__text--muted',
                )}
                x="435"
                y="139"
              >
                <tspan x="435">Hold</tspan>
                <tspan x="435" dy="15">
                  for enrich
                </tspan>
              </text>

              <rect
                className={flowShapeClass('watch', 'event-flow__shape--hold')}
                height="40"
                rx="3"
                width="190"
                x="730"
                y="124"
              />
              <text
                className={flowTextClass(
                  'watch',
                  'event-flow__text event-flow__text--muted',
                )}
                x="825"
                y="139"
              >
                <tspan x="825">Watch</tspan>
                <tspan x="825" dy="15">
                  queue
                </tspan>
              </text>
            </svg>
          </div>
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
