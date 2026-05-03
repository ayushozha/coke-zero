import { useState } from 'react'
import { AorMap } from './AorMap'
import { CesiumGlobe } from './CesiumGlobe'
import { MissionAlert } from './MissionAlert'
import type { ScenarioDefinition } from '../data/scenarioLibrary'
import { signalEffectState } from '../lib/signalEffects'
import type { PlaybackStatus } from '../types/playback'
import type { Signal } from '../types/canopy'

type MapStageProps = {
  correlatedSignalIds: string[]
  focusSignalId: string | null
  offsets: number[]
  playback: PlaybackStatus | null
  scenario: ScenarioDefinition
  signals: Signal[]
}

export function MapStage({
  correlatedSignalIds,
  focusSignalId,
  offsets,
  playback,
  scenario,
  signals,
}: MapStageProps) {
  const [viewMode, setViewMode] = useState<'nav' | 'globe'>('nav')
  const [focusRequestId, setFocusRequestId] = useState(0)
  const isGlobe = viewMode === 'globe'
  const latestSignal = signals[0] ?? null
  const effectState = signalEffectState(latestSignal)

  return (
    <section
      className={[
        'map-stage',
        isGlobe ? 'map-stage--globe' : '',
        `map-stage--${effectState}`,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Operational map"
    >
      {isGlobe ? (
        <CesiumGlobe
          correlatedSignalIds={correlatedSignalIds}
          displayMode="globe"
          focusSignalId={focusSignalId}
          signals={signals}
        />
      ) : (
        <AorMap
          correlatedSignalIds={correlatedSignalIds}
          focusSignalId={focusSignalId}
          focusRequestId={focusRequestId}
          offsets={offsets}
          playback={playback}
          scenario={scenario}
          signals={signals}
        />
      )}
      <MissionAlert
        onFocusLocation={() => {
          setViewMode('nav')
          setFocusRequestId((current) => current + 1)
        }}
        playback={playback}
        signal={latestSignal}
      />
      <div
        className={
          isGlobe
            ? 'map-view-toggle map-view-toggle--globe'
            : 'map-view-toggle map-view-toggle--nav'
        }
        aria-label="View mode"
      >
        <button
          aria-pressed={!isGlobe}
          className={!isGlobe ? 'is-active' : ''}
          onClick={() => setViewMode('nav')}
          type="button"
        >
          NAV
        </button>
        <button
          aria-pressed={isGlobe}
          className={isGlobe ? 'is-active' : ''}
          onClick={() => setViewMode('globe')}
          type="button"
        >
          GLOBE
        </button>
      </div>
    </section>
  )
}
