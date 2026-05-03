import { useEffect, useMemo, useState } from 'react'
import { ApproveBanner } from '../components/ApproveBanner'
import { EventFeed } from '../components/EventFeed'
import { MapStage } from '../components/MapStage'
import { MissionSummary } from '../components/MissionSummary'
import { ScenarioRail } from '../components/ScenarioRail'
import { defaultScenario, scenarios } from '../data/scenarioLibrary'
import { useCanopyMissionState } from '../hooks/useCanopyMissionState'
import { useCanopySocket } from '../hooks/useCanopySocket'
import type { PlaybackStatus } from '../types/playback'
import type { Signal } from '../types/canopy'

const fieldDurationFloorMs = 4 * 60 * 60 * 1000
const fieldDurationScale = 18
const playbackTickMs = 1000
const simulatedMsPerTick = 60 * 1000
const playbackScaleLabel = '1 SEC = 1 SIM MIN'

const signalTimeMs = (signal: Signal | undefined) => {
  const time = Date.parse(signal?.ts ?? '')
  return Number.isFinite(time) ? time : null
}

const buildPlaybackTimeline = (signals: Signal[]) => {
  const times = signals
    .map(signalTimeMs)
    .filter((time): time is number => time !== null)
  const startMs = times.length ? Math.min(...times) : 0
  const endMs = times.length ? Math.max(...times) : startMs
  const realDurationMs = Math.max(endMs - startMs, 1)
  const durationMs = Math.max(
    fieldDurationFloorMs,
    realDurationMs * fieldDurationScale,
  )

  const offsets = signals.map((signal, index) => {
    const time = signalTimeMs(signal)
    if (time === null || realDurationMs <= 1) {
      return signals.length > 1
        ? (index / (signals.length - 1)) * durationMs
        : 0
    }

    return ((time - startMs) / realDurationMs) * durationMs
  })

  return { durationMs, offsets }
}

export function Brigade() {
  const socketState = useCanopySocket()
  const [activeScenarioId, setActiveScenarioId] = useState(defaultScenario.id)
  const [simElapsedMs, setSimElapsedMs] = useState(0)
  const [isApproved, setIsApproved] = useState(false)
  const activeScenario =
    scenarios.find((scenario) => scenario.id === activeScenarioId) ??
    defaultScenario
  const playbackTimeline = useMemo(
    () => buildPlaybackTimeline(activeScenario.signals),
    [activeScenario.signals],
  )

  useEffect(() => {
    if (
      socketState.signals.length ||
      simElapsedMs >= playbackTimeline.durationMs
    ) {
      return
    }

    const timer = window.setInterval(() => {
      setSimElapsedMs((current) =>
        Math.min(current + simulatedMsPerTick, playbackTimeline.durationMs),
      )
    }, playbackTickMs)

    return () => window.clearInterval(timer)
  }, [playbackTimeline.durationMs, simElapsedMs, socketState.signals.length])

  const selectScenario = (scenarioId: string) => {
    setActiveScenarioId(scenarioId)
    setSimElapsedMs(0)
    setIsApproved(false)
  }

  const revealedSignalCount = useMemo(
    () =>
      Math.max(
        1,
        playbackTimeline.offsets.filter((offset) => offset <= simElapsedMs)
          .length,
      ),
    [playbackTimeline.offsets, simElapsedMs],
  )

  const mockSignals = useMemo(
    () =>
      activeScenario.signals
        .slice(0, revealedSignalCount)
        .reverse(),
    [activeScenario.signals, revealedSignalCount],
  )

  const signals = socketState.signals.length ? socketState.signals : mockSignals
  const nextInjectMs =
    playbackTimeline.offsets.find((offset) => offset > simElapsedMs) ?? null
  const playbackStatus: PlaybackStatus = {
    durationMs: playbackTimeline.durationMs,
    elapsedMs: simElapsedMs,
    nextInjectMs:
      nextInjectMs === null ? null : Math.max(0, nextInjectMs - simElapsedMs),
    progress: Math.round(
      (simElapsedMs / Math.max(playbackTimeline.durationMs, 1)) * 100,
    ),
    scaleLabel: playbackScaleLabel,
  }
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
            playback={socketState.signals.length ? null : playbackStatus}
            scenario={activeScenario}
            signals={signals}
          />

          <EventFeed
            playback={socketState.signals.length ? null : playbackStatus}
            signals={signals}
          />
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
