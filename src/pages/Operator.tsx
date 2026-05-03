import { useEventStore } from '../store/eventStore'
import { ReasoningPanel } from '../components/ReasoningPanel'

export function Operator() {
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
              {anomalies.slice(0, 12).map((a) => (
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
              {decisions.slice(0, 12).map((d) => (
                <li key={d.id}>
                  <span className="operator-list__kind">{d.action}</span>
                  <span className="operator-list__sev">
                    {d.authority} · {d.target}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="operator-shell__footer">
            {signals.length} signals streamed
          </div>
        </div>
        <ReasoningPanel />
      </section>
    </main>
  )
}
