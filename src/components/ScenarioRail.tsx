import type { ScenarioDefinition } from '../data/scenarioLibrary'

type ScenarioRailProps = {
  activeScenarioId: string
  onSelectScenario: (scenarioId: string) => void
  scenarios: ScenarioDefinition[]
  collapsed?: boolean
}

const familyLabel = (family: ScenarioDefinition['family']) => {
  if (family === 'iran') {
    return 'Iran sim'
  }
  if (family === 'army') {
    return 'Army sim'
  }
  return 'Reg sim'
}

export function ScenarioRail({
  activeScenarioId,
  onSelectScenario,
  scenarios,
  collapsed = false,
}: ScenarioRailProps) {
  const activeScenario =
    scenarios.find((scenario) => scenario.id === activeScenarioId) ??
    scenarios[0]

  return (
    <aside
      className={`scenario-rail${collapsed ? ' scenario-rail--collapsed' : ''}`}
      aria-label="Scenario library"
      aria-hidden={collapsed}
    >
      <div className="scenario-rail__header">
        <span>Scenario Stack</span>
        <strong>{scenarios.length} simulations loaded</strong>
        <div className="scenario-rail__legend" aria-hidden="true">
          <i className="scenario-rail__key scenario-rail__key--iran">Iran sim</i>
          <i className="scenario-rail__key scenario-rail__key--army">Army sim</i>
          <i className="scenario-rail__key scenario-rail__key--regional">
            Reg sim
          </i>
        </div>
      </div>

      {activeScenario ? (
        <div className={`scenario-rail__current scenario-rail__current--${activeScenario.family}`}>
          <span>Current scenario</span>
          <strong>{activeScenario.shortName}</strong>
          <p>{activeScenario.theater}</p>
          <em>
            {activeScenario.signals.length.toString().padStart(2, '0')} reports /{' '}
            {activeScenario.domains.length} domains
          </em>
        </div>
      ) : null}

      <nav className="scenario-list" aria-label="Available scenarios">
        {scenarios.map((scenario) => {
          const isActive = scenario.id === activeScenarioId

          return (
            <button
              aria-current={isActive ? 'true' : undefined}
              className={
                isActive
                  ? `scenario-list__item scenario-list__item--${scenario.family} scenario-list__item--active`
                  : `scenario-list__item scenario-list__item--${scenario.family}`
              }
              key={scenario.id}
              onClick={() => onSelectScenario(scenario.id)}
              type="button"
            >
              <span>{scenario.id}</span>
              <strong>{scenario.shortName}</strong>
              <em>{familyLabel(scenario.family)}</em>
            </button>
          )
        })}
      </nav>

      <div className="scenario-rail__footer">
        <span>Replay source</span>
        <strong>Scenario JSONL</strong>
      </div>
    </aside>
  )
}
