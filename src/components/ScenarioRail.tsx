const scenarios = [
  { id: '01', name: 'Iran counter-C5ISR', status: 'Primary' },
  { id: '02', name: 'SATCOM denial window', status: 'Ready' },
  { id: '03', name: 'GPS spoofed drones', status: 'Ready' },
  { id: '04', name: 'RPO close approach', status: 'Ready' },
  { id: '05', name: 'EW corridor opening', status: 'Ready' },
  { id: '06', name: 'Cyber on relay node', status: 'Ready' },
  { id: '07', name: 'Drone FDIR reroute', status: 'Ready' },
  { id: '08', name: 'Autonomous ISR relay', status: 'Ready' },
  { id: '09', name: 'OSINT cue to orbital task', status: 'Ready' },
  { id: '10', name: 'Multi-domain convergence', status: 'Ready' },
  { id: '11', name: 'Commander approval packet', status: 'Ready' },
]

export function ScenarioRail() {
  const visibleScenarios = scenarios.slice(0, 6)
  const hiddenCount = scenarios.length - visibleScenarios.length

  return (
    <aside className="scenario-rail" aria-label="Scenario library">
      <div className="scenario-rail__header">
        <span>Scenario Stack</span>
        <strong>Active track</strong>
      </div>

      <nav className="scenario-list" aria-label="Available scenarios">
        {visibleScenarios.map((scenario) => (
          <button
            className={
              scenario.status === 'Primary'
                ? 'scenario-list__item scenario-list__item--active'
                : 'scenario-list__item'
            }
            key={scenario.id}
            type="button"
          >
            <span>{scenario.id}</span>
            <strong>{scenario.name}</strong>
            {scenario.status === 'Primary' ? <em>{scenario.status}</em> : null}
          </button>
        ))}
      </nav>

      <div className="scenario-rail__footer">
        <span>{hiddenCount} more loaded</span>
        <strong>Replay armed</strong>
      </div>
    </aside>
  )
}
