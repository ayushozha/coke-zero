import type { ScenarioDefinition } from '../data/scenarioLibrary'

type ScenarioRailProps = {
  activeScenarioId: string
  onSelectScenario: (scenarioId: string) => void
  scenarios: ScenarioDefinition[]
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
}: ScenarioRailProps) {
  return (
    <aside className="scenario-rail" aria-label="Scenario library">
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
