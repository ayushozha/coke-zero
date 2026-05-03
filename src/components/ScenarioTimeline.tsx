import { useState } from 'react'
import { commanderSignalSummary, signalKindLabel } from '../lib/commanderLanguage'
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
  const [selectedEvent, setSelectedEvent] = useState<{
    index: number
    scenarioId: string
  } | null>(null)
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
  const selectedEventIndex =
    selectedEvent?.scenarioId === scenario.id &&
    selectedEvent.index < completedInjects
      ? selectedEvent.index
      : null
  const selectedSignal =
    selectedEventIndex !== null
      ? scenario.signals[selectedEventIndex]
      : null
  const focusSignal = selectedSignal ?? currentSignal
  const nextSignal = nextIndex >= 0 ? scenario.signals[nextIndex] : null
  const focusSummary = focusSignal
    ? commanderSignalSummary(focusSignal)
    : null
  const nextLabel = playback
    ? playback.nextInjectMs === null
      ? 'HOLD'
      : `+${formatDuration(playback.nextInjectMs)}`
    : nextSignal
      ? 'QUEUED'
      : 'HOLD'
  const completedSignals = scenario.signals.slice(0, completedInjects)

  return (
    <section className="panel scenario-timeline" aria-label="Timeline and events">
      <div className="scenario-timeline__header">
        <div>
          <span>Timeline</span>
          <h2>Events</h2>
        </div>
        <strong>
          {completedInjects.toString().padStart(2, '0')}/
          {totalInjects.toString().padStart(2, '0')}
        </strong>
      </div>

      <div className="scenario-timeline__meta">
        <span>
          <b>{playback ? 'FEED PLAYBACK' : 'LIVE INGEST'}</b>
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

      <div className="scenario-timeline__rail" aria-label="Completed event timeline">
        <span
          className="scenario-timeline__rail-fill"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
        {completedSignals.map((signal, index) => {
          const offset = offsets[index] ?? 0
          const left = Math.min(
            100,
            Math.max(0, (offset / Math.max(durationMs, 1)) * 100),
          )
          const summary = commanderSignalSummary(signal)
          const markerClass =
            index < completedInjects
              ? 'scenario-timeline__marker scenario-timeline__marker--complete'
              : index === nextIndex
                ? 'scenario-timeline__marker scenario-timeline__marker--next'
                : 'scenario-timeline__marker'
          const isSelected = index === selectedEventIndex

          return (
            <button
              aria-label={`Show event ${index + 1}: ${summary.oneLine}`}
              aria-pressed={isSelected}
              className={`${markerClass}${
                isSelected ? ' scenario-timeline__marker--selected' : ''
              }`}
              key={signal.id}
              onClick={() => setSelectedEvent({ index, scenarioId: scenario.id })}
              style={{ left: `${left}%` }}
              title={summary.oneLine}
              type="button"
            />
          )
        })}
        {nextIndex >= 0 ? (
          <i
            className="scenario-timeline__marker scenario-timeline__marker--next"
            style={{
              left: `${Math.min(
                100,
                Math.max(
                  0,
                  ((offsets[nextIndex] ?? 0) / Math.max(durationMs, 1)) * 100,
                ),
              )}%`,
            }}
          />
        ) : null}
      </div>

      <div className="scenario-timeline__focus">
        <span>{selectedSignal ? 'Selected event' : 'Current phase'}</span>
        <strong>{focusSummary?.oneLine ?? scenario.objective}</strong>
        <p>
          {selectedSignal
            ? `${formatDuration(offsets[selectedEventIndex ?? 0] ?? 0)} · ${focusSummary?.label ?? signalKindLabel(selectedSignal)} · ${focusSummary?.location ?? selectedSignal.source}`
            : nextSignal
            ? 'Next update pending.'
            : focusSummary?.action ?? 'Scenario complete; hold commander view.'}
        </p>
      </div>

      <ol className="scenario-timeline__list" aria-label="Completed event log">
        {completedSignals.map((signal, absoluteIndex) => {
          const summary = commanderSignalSummary(signal)
          const isSelected = absoluteIndex === selectedEventIndex
          const rowState =
            absoluteIndex < completedInjects
              ? 'complete'
              : absoluteIndex === nextIndex
                ? 'next'
                : 'pending'

          return (
            <li
              className={`scenario-timeline__row scenario-timeline__row--${rowState}${
                isSelected ? ' scenario-timeline__row--selected' : ''
              }`}
              key={signal.id}
            >
              <span className="scenario-timeline__row-time">
                {formatDuration(offsets[absoluteIndex] ?? 0)}
              </span>
              <span className="scenario-timeline__row-domain">
                {signalKindLabel(signal)}
              </span>
              <strong>{summary.oneLine}</strong>
            </li>
          )
        })}
        {nextSignal ? (
          <li className="scenario-timeline__row scenario-timeline__row--next">
            <span className="scenario-timeline__row-time">{nextLabel}</span>
            <span className="scenario-timeline__row-domain">Pending</span>
            <strong>Next update pending.</strong>
          </li>
        ) : null}
      </ol>
    </section>
  )
}
