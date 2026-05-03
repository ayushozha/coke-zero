import { useState } from 'react'
import { AorMap } from './AorMap'
import { CesiumGlobe } from './CesiumGlobe'
import type { ScenarioDefinition } from '../data/scenarioLibrary'
import type { PlaybackStatus } from '../types/playback'
import type { Signal } from '../types/canopy'

type MapStageProps = {
  correlatedSignalIds: string[]
  focusSignalId: string | null
  playback: PlaybackStatus | null
  scenario: ScenarioDefinition
  signals: Signal[]
}

export function MapStage({
  correlatedSignalIds,
  focusSignalId,
  playback,
  scenario,
  signals,
}: MapStageProps) {
  const [viewMode, setViewMode] = useState<'nav' | 'globe'>('nav')
  const isGlobe = viewMode === 'globe'

  return (
    <section
      className={isGlobe ? 'map-stage map-stage--globe' : 'map-stage'}
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
          playback={playback}
          scenario={scenario}
          signals={signals}
        />
      )}
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
