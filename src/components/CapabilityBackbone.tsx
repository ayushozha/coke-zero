import { useMemo } from 'react'
import { useEventStore } from '../store/eventStore'
import type { ReasoningTrace } from '../types/coke_zero'

type CapabilityState = 'active' | 'ready' | 'degraded'

type CapabilityItem = {
  detail: string
  label: string
  state: CapabilityState
  status: string
}

type Props = {
  compact?: boolean
}

const truncate = (value: string, max = 92) =>
  value.length > max ? `${value.slice(0, max - 1)}...` : value

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null

const shortLabel = (label: string) =>
  label
    .replace(' grounding', '')
    .replace(' watch', '')
    .replace(' transport', '')
    .replace('Decision tools', 'Tools')

const latest = <T,>(items: T[], predicate: (item: T) => boolean): T | null => {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (predicate(items[i])) return items[i]
  }
  return null
}

const traceText = (trace: ReasoningTrace) =>
  `${trace.stage} ${trace.level} ${trace.message}`.toLowerCase()

const hasNiaEvidence = (trace: ReasoningTrace) => {
  if (traceText(trace).includes('nia')) return true
  const result = asRecord(trace.payload?.result)
  return Boolean(asRecord(result?.nia_context) ?? asRecord(trace.payload?.nia_context))
}

const niaStatus = (trace: ReasoningTrace | null) => {
  if (!trace) {
    return {
      state: 'ready' as const,
      status: 'standby',
      detail: 'Project context is available when attribution or KB lookup asks for it.',
    }
  }

  const result = asRecord(trace.payload?.result)
  const nia = asRecord(result?.nia_context) ?? asRecord(trace.payload?.nia_context)
  const count = typeof nia?.count === 'number' ? nia.count : null
  const citations = Array.isArray(trace.payload?.citations)
    ? trace.payload.citations.filter((item): item is string => typeof item === 'string')
    : []
  const status =
    count !== null
      ? `${count} context hit${count === 1 ? '' : 's'}`
      : citations.length
        ? `${citations.length} cited source${citations.length === 1 ? '' : 's'}`
        : 'grounded'

  return {
    state: 'active' as const,
    status,
    detail: citations.length ? citations.slice(0, 2).join(' / ') : truncate(trace.message),
  }
}

const tensorlakeStatus = (trace: ReasoningTrace | null) => {
  if (!trace) {
    return {
      state: 'ready' as const,
      status: 'standby',
      detail: 'Mission watch can run as a Tensorlake-compatible worker or local shim.',
    }
  }

  const mode = asString(trace.payload?.mode)
  const execution =
    asString(trace.payload?.execution) ??
    (traceText(trace).includes('tensorlake') ? 'tensorlake worker' : null)
  const runId = asString(trace.payload?.run_id)
  const scenario = asString(trace.payload?.scenario) ?? trace.ref_id
  return {
    state: 'active' as const,
    status: execution ?? mode ?? 'watch cycle',
    detail: truncate([runId ? `run ${runId}` : null, scenario].filter(Boolean).join(' / ') || trace.message),
  }
}

const transportStatus = (
  connection: ReturnType<typeof useEventStore.getState>['connection'],
) => {
  if (connection === 'live') {
    return {
      state: 'active' as const,
      status: 'live ws',
      detail: 'Frontend is attached to the FastAPI event stream.',
    }
  }
  if (connection === 'fixture') {
    return {
      state: 'active' as const,
      status: 'static',
      detail: 'Vercel-safe replay mirrors the same WebSocket event contract.',
    }
  }
  if (connection === 'offline') {
    return {
      state: 'degraded' as const,
      status: 'offline',
      detail: 'No backend or fixture stream is currently available.',
    }
  }
  return {
    state: 'ready' as const,
    status: 'connecting',
    detail: 'Transport is negotiating live stream or deploy-safe fixture mode.',
  }
}

const toolStatus = (toolTraces: ReasoningTrace[]) => {
  const current = toolTraces[toolTraces.length - 1] ?? null
  if (!current) {
    return {
      state: 'ready' as const,
      status: '0 calls',
      detail: 'Decision tools fire when an authority request needs evidence.',
    }
  }
  const tool = asString(current.payload?.tool) ?? 'tool'
  return {
    state: current.level === 'warn' ? ('degraded' as const) : ('active' as const),
    status: `${toolTraces.length} call${toolTraces.length === 1 ? '' : 's'}`,
    detail: truncate(`${tool}: ${current.message}`),
  }
}

export function CapabilityBackbone({ compact = false }: Props) {
  const traces = useEventStore((s) => s.traces)
  const connection = useEventStore((s) => s.connection)

  const items = useMemo<CapabilityItem[]>(() => {
    const toolTraces = traces.filter((trace) => trace.stage === 'tools')
    const watchTrace = latest(
      traces,
      (trace) =>
        trace.stage === 'watch' ||
        traceText(trace).includes('tensorlake') ||
        asString(trace.payload?.execution)?.includes('tensorlake') === true,
    )
    return [
      {
        label: 'Nia grounding',
        ...niaStatus(latest(traces, hasNiaEvidence)),
      },
      {
        label: 'Tensorlake watch',
        ...tensorlakeStatus(watchTrace),
      },
      {
        label: 'Vercel transport',
        ...transportStatus(connection),
      },
      {
        label: 'Decision tools',
        ...toolStatus(toolTraces),
      },
    ]
  }, [connection, traces])

  const activeCount = items.filter((item) => item.state === 'active').length

  if (compact) {
    const compactItems = items.slice(0, 2)
    return (
      <section
        className="capability-backbone capability-backbone--compact"
        aria-label="Integrated capability backbone"
      >
        <div className="capability-backbone__header capability-backbone__header--compact">
          <span>Backbone</span>
          <div className="capability-backbone__chips">
            {compactItems.map((item) => (
              <span
                className={`capability-backbone__chip capability-backbone__chip--${item.state}`}
                key={item.label}
                title={`${item.label}: ${item.detail}`}
              >
                {shortLabel(item.label)} <strong>{item.status}</strong>
              </span>
            ))}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section
      className="capability-backbone"
      aria-label="Integrated capability backbone"
    >
      <div className="capability-backbone__header">
        <span>Capability backbone</span>
        <strong>{activeCount}/{items.length} active</strong>
      </div>
      <div className="capability-backbone__grid">
        {items.map((item) => (
          <article
            className={`capability-backbone__item capability-backbone__item--${item.state}`}
            key={item.label}
          >
            <div className="capability-backbone__top">
              <span>{item.label}</span>
              <strong>{item.status}</strong>
            </div>
            <p>{item.detail}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
