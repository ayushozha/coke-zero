import { useEventStore } from '../store/eventStore'
import { ActionLog } from '../components/ActionLog'
import { EmbeddingViz } from '../components/EmbeddingViz'
import { ReasoningPanel } from '../components/ReasoningPanel'
import { useCanopySocket } from '../hooks/useCanopySocket'

export function Operator() {
  // Open the same WebSocket Brigade uses so live engine output streams
  // into the global event store while the operator is on this page.
  // Without this hook the page is read-only on whatever sessionStorage
  // had cached, so the reasoning panel and queues only "update" when
  // the user toggles back to Brigade and a re-render fires.
  useCanopySocket()

  const signals = useEventStore((s) => s.signals)
  const anomalies = useEventStore((s) => s.anomalies)
  const decisions = useEventStore((s) => s.decisions)

  return (
    <main className="operator-shell">
      <header className="app-header">
        <div>
          <p className="app-header__eyebrow">CANOPY / Operator</p>
          <h1>Fusion Console</h1>
        </div>
        <a href="/brigade">Brigade View</a>
      </header>
      <section className="operator-grid" aria-label="Operator fusion state">
        <div className="panel">
          <div className="panel__header">
            <h2>Anomaly Queue</h2>
            <span>{String(anomalies.length).padStart(2, '0')} open</span>
          </div>
          {anomalies.length === 0 ? (
            <p className="operator-shell__empty">No correlated patterns</p>
          ) : (
            <ul className="operator-list">
              {anomalies.map((a) => (
                <li key={a.id}>
                  <span className="operator-list__kind">{a.kind}</span>
                  <span className="operator-list__sev">
                    sev {a.severity.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel">
          <div className="panel__header">
            <h2>Decision Rail</h2>
            <span>{String(decisions.length).padStart(2, '0')} pending</span>
          </div>
          {decisions.length === 0 ? (
            <p className="operator-shell__empty">No authority requests</p>
          ) : (
            <ul className="operator-list">
              {decisions.map((d) => (
                <li key={d.id}>
                  <span className="operator-list__kind">{d.action}</span>
                  <span className="operator-list__sev">
                    {d.authority} · {d.target}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="operator-shell__footer" aria-live="polite">
            {signals.length} signals streamed
          </div>
        </div>
        <ActionLog limit={20} />
        <EmbeddingViz />
        <ReasoningPanel />
      </section>
    </main>
  )
}
