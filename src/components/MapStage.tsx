import { useState } from 'react'
import { AorMap } from './AorMap'
import { CesiumGlobe } from './CesiumGlobe'
import type { ScenarioDefinition } from '../data/scenarioLibrary'
import type { Signal } from '../types/canopy'

type MapStageProps = {
  correlatedSignalIds: string[]
  focusSignalId: string | null
  scenario: ScenarioDefinition
  signals: Signal[]
}

export function MapStage({
  correlatedSignalIds,
  focusSignalId,
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
      <div className="tak-map-chrome" aria-hidden="true">
        <span>{isGlobe ? 'SPACE' : 'AOR'}</span>
        <strong>{isGlobe ? 'CSM CUSTODY' : 'CANOPY COP'}</strong>
        <em>
          {isGlobe
            ? `${correlatedSignalIds.length.toString().padStart(2, '0')} fused`
            : `${scenario.id} / ${signals.length.toString().padStart(2, '0')} feeds`}
        </em>
      </div>
    </section>
  )
}
