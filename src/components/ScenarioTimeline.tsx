import { commanderSignalSummary, domainLabel } from '../lib/commanderLanguage'
import type { ScenarioDefinition } from '../data/scenarioLibrary'
import type { PlaybackStatus } from '../types/playback'
import type { Signal } from '../types/canopy'

type ScenarioTimelineProps = {
  offsets: number[]
  playback: PlaybackStatus | null
  scenario: ScenarioDefinition
  signals: Signal[]
}

const formatDuration = (milliseconds: number) => {
  if (milliseconds > 0 && milliseconds < 60 * 1000) {
    return '<1M'
  }

  const totalMinutes = Math.max(0, Math.round(milliseconds / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours > 0) {
    return `${hours}H ${minutes.toString().padStart(2, '0')}M`
  }

  return `${minutes}M`
}

const phaseForProgress = (progress: number) => {
  if (progress >= 100) {
    return 'ENDEX hold'
  }
  if (progress >= 72) {
    return 'Decision window'
  }
  if (progress >= 42) {
    return 'Correlate effects'
  }
  if (progress >= 16) {
    return 'Build picture'
  }
  return 'Initial custody'
}

export function ScenarioTimeline({
  offsets,
  playback,
  scenario,
  signals,
}: ScenarioTimelineProps) {
  const totalInjects = scenario.signals.length
  const completedInjects = playback
    ? Math.min(
        totalInjects,
        Math.max(
          1,
          offsets.filter((offset) => offset <= playback.elapsedMs).length,
        ),
      )
    : Math.min(totalInjects, Math.max(1, signals.length))
  const currentIndex = Math.max(0, completedInjects - 1)
  const nextIndex = playback
    ? offsets.findIndex((offset) => offset > playback.elapsedMs)
    : completedInjects < totalInjects
      ? completedInjects
      : -1
  const durationMs =
    playback?.durationMs ?? Math.max(...offsets, 60 * 60 * 1000)
  const progress = playback
    ? playback.progress
    : Math.round((completedInjects / Math.max(totalInjects, 1)) * 100)
  const phase = phaseForProgress(progress)
  const currentSignal = scenario.signals[currentIndex] ?? signals[0] ?? null
  const nextSignal = nextIndex >= 0 ? scenario.signals[nextIndex] : null
  const currentSummary = currentSignal
    ? commanderSignalSummary(currentSignal)
    : null
  const nextSummary = nextSignal ? commanderSignalSummary(nextSignal) : null
  const nextLabel = playback
    ? playback.nextInjectMs === null
      ? 'HOLD'
      : `+${formatDuration(playback.nextInjectMs)}`
    : nextSignal
      ? 'QUEUED'
      : 'HOLD'
  const visibleStart = Math.max(
    0,
    Math.min(currentIndex - 1, totalInjects - 4),
  )
  const visibleSignals = scenario.signals.slice(visibleStart, visibleStart + 4)

  return (
    <section className="panel scenario-timeline" aria-label="Scenario timeline">
      <div className="scenario-timeline__header">
        <div>
          <span>Scenario Injects</span>
          <h2>{scenario.shortName}</h2>
        </div>
        <strong>
          {completedInjects.toString().padStart(2, '0')}/
          {totalInjects.toString().padStart(2, '0')}
        </strong>
      </div>

      <div className="scenario-timeline__meta">
        <span>
          <b>{playback ? 'SIM PLAYBACK' : 'LIVE INGEST'}</b>
          {phase}
        </span>
        <span>
          <b>NEXT</b>
          {nextLabel}
        </span>
        <span>
          <b>WINDOW</b>
          {formatDuration(durationMs)}
        </span>
      </div>

      <div className="scenario-timeline__rail" aria-hidden="true">
        <span
          className="scenario-timeline__rail-fill"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
        {scenario.signals.map((signal, index) => {
          const offset = offsets[index] ?? 0
          const left = Math.min(
            100,
            Math.max(0, (offset / Math.max(durationMs, 1)) * 100),
          )
          const markerClass =
            index < completedInjects
              ? 'scenario-timeline__marker scenario-timeline__marker--complete'
              : index === nextIndex
                ? 'scenario-timeline__marker scenario-timeline__marker--next'
                : 'scenario-timeline__marker'

          return (
            <i
              className={markerClass}
              key={signal.id}
              style={{ left: `${left}%` }}
            />
          )
        })}
      </div>

      <div className="scenario-timeline__focus">
        <span>Current phase</span>
        <strong>{currentSummary?.headline ?? scenario.objective}</strong>
        <p>
          {nextSummary
            ? `Next: ${nextSummary.detail}`
            : currentSummary?.action ?? 'Scenario complete; hold commander view.'}
        </p>
      </div>

      <ol className="scenario-timeline__list">
        {visibleSignals.map((signal, relativeIndex) => {
          const absoluteIndex = visibleStart + relativeIndex
          const summary = commanderSignalSummary(signal)
          const rowState =
            absoluteIndex < completedInjects
              ? 'complete'
              : absoluteIndex === nextIndex
                ? 'next'
                : 'pending'

          return (
            <li
              className={`scenario-timeline__row scenario-timeline__row--${rowState}`}
              key={signal.id}
            >
              <span className="scenario-timeline__row-time">
                {formatDuration(offsets[absoluteIndex] ?? 0)}
              </span>
              <span className="scenario-timeline__row-domain">
                {domainLabel(signal.domain)}
              </span>
              <strong>{summary.headline}</strong>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
