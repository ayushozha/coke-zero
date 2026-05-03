import { useEffect, useMemo, useState } from 'react'
import { ApproveBanner } from '../components/ApproveBanner'
import { EventFeed } from '../components/EventFeed'
import { MapStage } from '../components/MapStage'
import { MissionSummary } from '../components/MissionSummary'
import { ScenarioRail } from '../components/ScenarioRail'
import { defaultScenario, scenarios } from '../data/scenarioLibrary'
import { useCanopyMissionState } from '../hooks/useCanopyMissionState'
import { useCanopySocket } from '../hooks/useCanopySocket'

const nowMinus = (seconds: number) =>
  new Date(Date.now() - seconds * 1000).toISOString()

export function Brigade() {
  const socketState = useCanopySocket()
  const [activeScenarioId, setActiveScenarioId] = useState(defaultScenario.id)
  const [beatIndex, setBeatIndex] = useState(1)
  const [isApproved, setIsApproved] = useState(false)
  const activeScenario =
    scenarios.find((scenario) => scenario.id === activeScenarioId) ??
    defaultScenario

  useEffect(() => {
    const timer = window.setInterval(() => {
      setBeatIndex((current) => (current % activeScenario.signals.length) + 1)
    }, 1500)

    return () => window.clearInterval(timer)
  }, [activeScenario.signals.length])

  const selectScenario = (scenarioId: string) => {
    setActiveScenarioId(scenarioId)
    setBeatIndex(1)
    setIsApproved(false)
  }

  const mockSignals = useMemo(
    () =>
      activeScenario.signals
        .slice(0, beatIndex)
        .map((signal, index) => ({
          ...signal,
          ts: nowMinus((beatIndex - index) * 4),
        }))
        .reverse(),
    [activeScenario.signals, beatIndex],
  )

  const signals = socketState.signals.length ? socketState.signals : mockSignals
  const latestAttribution = socketState.attributions[0] ?? null
  const latestDecision = socketState.decisions[0] ?? null
  const latestUiEvent = socketState.uiEvents[0] ?? null
  const missionState = useCanopyMissionState(signals, socketState.uiEvents)

  return (
    <main className="brigade-shell">
      <header className="app-header">
        <div>
          <p className="app-header__eyebrow">CANOPY</p>
          <h1>Brigade COP</h1>
        </div>
        <div className="app-header__right">
          <span
            className={
              socketState.isConnected
                ? 'socket-status socket-status--online'
                : 'socket-status'
            }
          >
            {socketState.isConnected ? 'Live data' : 'Demo data'}
          </span>
          <a href="/operator">Ops</a>
        </div>
      </header>

      <section className="command-workbench">
        <ScenarioRail
          activeScenarioId={activeScenario.id}
          onSelectScenario={selectScenario}
          scenarios={scenarios}
        />

        <section className="map-workspace" aria-label="Map and incoming reports">
          <MapStage
            correlatedSignalIds={missionState.correlatedSignalIds}
            focusSignalId={missionState.mapFocusSignalId}
            scenario={activeScenario}
            signals={signals}
          />

          <EventFeed signals={signals} />
        </section>

        <aside className="decision-stack" aria-label="Commander decision stack">
          <MissionSummary
            attribution={latestAttribution}
            decision={latestDecision}
            scenario={activeScenario}
            uiEvent={latestUiEvent}
            signalCount={signals.length}
          />
          <ApproveBanner
            decision={latestDecision}
            uiEvent={latestUiEvent}
            isApproved={isApproved}
            onApprove={() => setIsApproved(true)}
          />
        </aside>
      </section>
    </main>
  )
}
