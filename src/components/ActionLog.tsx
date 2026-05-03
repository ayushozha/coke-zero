import { useMemo } from 'react'
import { useEventStore } from '../store/eventStore'
import type { ReasoningTrace } from '../types/canopy'

interface Props {
  /** When true, the panel renders compact for a sidebar slot. */
  compact?: boolean
  /** Maximum rows to render; oldest are pushed off the top. */
  limit?: number
}

const TOOL_GLYPH: Record<string, string> = {
  'kb.lookup': '◆',
  'orbit.compute_close_approach': '⊙',
  'orbit.simulate_maneuver': '↗',
  'request.draft': '✎',
  'routing.validate': '✓',
}

const TOOL_LABEL: Record<string, string> = {
  'kb.lookup': 'KB lookup',
  'orbit.compute_close_approach': 'Close approach',
  'orbit.simulate_maneuver': 'Simulate maneuver',
  'request.draft': 'Draft request',
  'routing.validate': 'Validate routing',
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  } catch {
    return '--:--:--'
  }
}

function summariseResult(trace: ReasoningTrace): string {
  // The Tracer.emit payload carries the full args + result blob from
  // tools.dispatch. Pull a short, human-readable summary out of it.
  const tool = (trace.payload?.tool ?? '') as string
  const result = (trace.payload?.result ?? {}) as Record<string, unknown>
  if (result.error) return `error: ${String(result.error)}`
  switch (tool) {
    case 'kb.lookup': {
      const count = (result.count ?? 0) as number
      return `${count} KB ${count === 1 ? 'entry' : 'entries'}`
    }
    case 'orbit.compute_close_approach': {
      const km = result.closest_approach_km
      const t = result.t_closest as string | undefined
      const time = t ? new Date(t).toLocaleTimeString('en-US', { hour12: false }) : '—'
      return km !== undefined ? `${km} km @ ${time}` : 'computed'
    }
    case 'orbit.simulate_maneuver': {
      const pre = result.pre_miss_km
      const post = result.post_miss_km
      const dv = result.dv_m_s
      return `${pre} → ${post} km · Δv ${dv} m/s`
    }
    case 'request.draft': {
      const packet = (result.request_packet ?? {}) as Record<string, unknown>
      return `→ ${packet.to ?? 'CJFSCC'}`
    }
    case 'routing.validate': {
      return result.valid ? 'valid' : `invalid · ${String(result.reason ?? '')}`
    }
    default:
      return trace.message
  }
}

function summariseArgs(trace: ReasoningTrace): string {
  const tool = (trace.payload?.tool ?? '') as string
  const args = (trace.payload?.args ?? {}) as Record<string, unknown>
  switch (tool) {
    case 'kb.lookup':
      return [args.actor, args.capability_type, args.scenario_signal_id]
        .filter(Boolean)
        .join(' · ')
    case 'orbit.compute_close_approach':
      return `${args.sat_a} vs ${args.sat_b}`
    case 'orbit.simulate_maneuver':
      return `${args.sat} vs ${args.against ?? '?'}`
    case 'request.draft':
      return `${args.actor} (${args.confidence})`
    case 'routing.validate':
      return `${args.action} → ${args.authority}`
    default:
      return ''
  }
}

export function ActionLog({ compact = false, limit = 12 }: Props) {
  // Select the raw traces array (stable reference) and derive the
  // filtered list with useMemo. Filtering inside the Zustand selector
  // returns a new array on every call which triggers a React 19
  // infinite render loop via useSyncExternalStore.
  const traces = useEventStore((s) => s.traces)
  const actions = useMemo(
    () => traces.filter((t) => t.stage === 'tools'),
    [traces],
  )
  const rows = useMemo(
    () => actions.slice(-limit).reverse(),
    [actions, limit],
  )

  return (
    <section
      className={`action-log${compact ? ' action-log--compact' : ''}`}
      aria-labelledby="action-log-title"
    >
      <div className="panel__header">
        <h2 id="action-log-title">System actions</h2>
        <span>{actions.length} tool calls</span>
      </div>
      <div className="action-log__stream">
        {rows.length === 0 ? (
          <div className="action-log__empty">
            no tool calls yet — run a request-authority scenario
          </div>
        ) : (
          <ul className="action-log__list">
            {rows.map((trace) => {
              const tool = (trace.payload?.tool ?? '') as string
              const glyph = TOOL_GLYPH[tool] ?? '·'
              const label = TOOL_LABEL[tool] ?? tool
              return (
                <li key={trace.id} className="action-log__row">
                  <span className="action-log__time">
                    {formatTime(trace.ts)}
                  </span>
                  <span className="action-log__glyph" aria-hidden="true">
                    {glyph}
                  </span>
                  <div className="action-log__body">
                    <div className="action-log__top">
                      <span className="action-log__name">{label}</span>
                      <span className="action-log__result">
                        {summariseResult(trace)}
                      </span>
                    </div>
                    {summariseArgs(trace) ? (
                      <div className="action-log__args">
                        {summariseArgs(trace)}
                      </div>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
