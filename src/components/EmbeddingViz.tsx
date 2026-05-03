import { useMemo, useState } from 'react'
import { useEventStore } from '../store/eventStore'
import type { EmbeddingPoint } from '../types/canopy'

interface Props {
  /** When true, renders compact (sidebar slot). */
  compact?: boolean
}

// Cluster palette. Index by cluster_id mod palette length so we don't
// have to coordinate with backend cluster numbering.
const PALETTE = [
  '#33f2f0', // cyan
  '#e05c4f', // red
  '#a7b96f', // olive
  '#8b87c7', // violet
  '#c9a457', // amber
  '#77b884', // green
  '#ff7b6d', // coral
  '#6fa8dc', // sky
]

const colorForCluster = (id: number) => PALETTE[id % PALETTE.length]

const VIEW = { width: 320, height: 220, margin: 18 }

export function EmbeddingViz({ compact = false }: Props) {
  const snapshot = useEventStore((s) => s.embeddingSnapshot)
  const [hover, setHover] = useState<EmbeddingPoint | null>(null)

  const layout = useMemo(() => {
    if (!snapshot || snapshot.points.length === 0) return null
    const xs = snapshot.points.map((p) => p.x)
    const ys = snapshot.points.map((p) => p.y)
    const xMin = Math.min(...xs)
    const xMax = Math.max(...xs)
    const yMin = Math.min(...ys)
    const yMax = Math.max(...ys)
    // Add 5% padding so points don't sit on the panel border.
    const xRange = Math.max(xMax - xMin, 0.001) * 1.1
    const yRange = Math.max(yMax - yMin, 0.001) * 1.1
    const xCenter = (xMin + xMax) / 2
    const yCenter = (yMin + yMax) / 2

    const project = (px: number, py: number) => {
      const u = (px - xCenter) / xRange + 0.5
      const v = (py - yCenter) / yRange + 0.5
      // Flip y so positive PCA-Y renders upward in screen space.
      return {
        x: VIEW.margin + u * (VIEW.width - 2 * VIEW.margin),
        y: VIEW.margin + (1 - v) * (VIEW.height - 2 * VIEW.margin),
      }
    }

    return {
      points: snapshot.points.map((point) => ({ point, ...project(point.x, point.y) })),
    }
  }, [snapshot])

  return (
    <section
      className={`embedding-viz${compact ? ' embedding-viz--compact' : ''}`}
      aria-labelledby="embedding-viz-title"
    >
      <div className="panel__header">
        <h2 id="embedding-viz-title">OSINT embedding space</h2>
        <span>
          {snapshot
            ? `${snapshot.points.length} pts · ${snapshot.cluster_count} clusters`
            : 'no data'}
        </span>
      </div>
      <div className="embedding-viz__body">
        {layout ? (
          <svg
            viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
            className="embedding-viz__svg"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="OSINT semantic clustering scatter plot"
          >
            <defs>
              <pattern
                id="emb-grid"
                width="32"
                height="32"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 32 0 L 0 0 0 32"
                  fill="none"
                  stroke="rgba(154, 190, 180, 0.08)"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect
              x={VIEW.margin}
              y={VIEW.margin}
              width={VIEW.width - 2 * VIEW.margin}
              height={VIEW.height - 2 * VIEW.margin}
              fill="url(#emb-grid)"
              stroke="rgba(154, 190, 180, 0.18)"
              strokeWidth="1"
            />
            {layout.points.map(({ point, x, y }) => {
              const color = colorForCluster(point.cluster_id)
              const isHover = hover?.signal_id === point.signal_id
              return (
                <g key={point.signal_id}>
                  <circle
                    cx={x}
                    cy={y}
                    r={isHover ? 7 : 5}
                    fill={color}
                    fillOpacity={0.42}
                    stroke={color}
                    strokeWidth={isHover ? 2 : 1.4}
                    onMouseEnter={() => setHover(point)}
                    onMouseLeave={() => setHover(null)}
                    style={{ cursor: 'pointer' }}
                  />
                  {isHover ? (
                    <text
                      x={x + 9}
                      y={y - 5}
                      fill="var(--text-primary)"
                      fontSize="9"
                      fontFamily="JetBrains Mono, SF Mono, Menlo, monospace"
                    >
                      C{point.cluster_id}
                    </text>
                  ) : null}
                </g>
              )
            })}
            <g
              fill="var(--text-subtle)"
              fontSize="8"
              fontFamily="JetBrains Mono, SF Mono, Menlo, monospace"
            >
              <text x={VIEW.margin} y={VIEW.height - 4}>
                PC1 →
              </text>
              <text
                x={VIEW.width / 2 - 12}
                y={VIEW.margin - 4}
                textAnchor="start"
              >
                PC2 ↑
              </text>
            </g>
          </svg>
        ) : (
          <div className="embedding-viz__empty">
            no embeddings yet — run a scenario with OSINT signals
          </div>
        )}
        {hover ? (
          <div className="embedding-viz__hover" role="status">
            <div className="embedding-viz__hover-cluster">
              cluster {hover.cluster_id}
            </div>
            <div className="embedding-viz__hover-summary">{hover.summary}</div>
          </div>
        ) : null}
      </div>
      {snapshot ? (
        <div className="embedding-viz__footer">
          <span>{snapshot.model_name}</span>
          <span>·</span>
          <span>{snapshot.embedding_dim}-dim</span>
          <span>·</span>
          <span>similarity ≥ {snapshot.similarity_threshold.toFixed(2)}</span>
        </div>
      ) : null}
    </section>
  )
}
