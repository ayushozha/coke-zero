import type { ScenarioDefinition } from '../data/scenarioLibrary'

type ScenarioRailProps = {
  activeScenarioId: string
  onSelectScenario: (scenarioId: string) => void
  scenarios: ScenarioDefinition[]
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
      </div>

      <nav className="scenario-list" aria-label="Available scenarios">
        {scenarios.map((scenario) => (
          <button
            className={
              scenario.id === activeScenarioId
                ? 'scenario-list__item scenario-list__item--active'
                : 'scenario-list__item'
            }
            key={scenario.id}
            onClick={() => onSelectScenario(scenario.id)}
            type="button"
          >
            <span>{scenario.id}</span>
            <strong>{scenario.shortName}</strong>
            {scenario.id === activeScenarioId ? <em>Active</em> : null}
          </button>
        ))}
      </nav>

      <div className="scenario-rail__footer">
        <span>Replay source</span>
        <strong>Scenario JSONL</strong>
      </div>
    </aside>
  )
}
