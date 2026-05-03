import { useState } from 'react'
import { CesiumGlobe } from './CesiumGlobe'
import type { Signal } from '../types/canopy'

type MapStageProps = {
  correlatedSignalIds: string[]
  focusSignalId: string | null
  latestSignal: Signal | null
  signals: Signal[]
}

export function MapStage({
  correlatedSignalIds,
  focusSignalId,
  latestSignal,
  signals,
}: MapStageProps) {
  const [viewMode, setViewMode] = useState<'nav' | 'globe'>('nav')
  const latestLabel =
    latestSignal?.location.label ?? latestSignal?.payload.asset ?? 'No focus'
  const latestDomain = latestSignal?.domain.replaceAll('_', ' ') ?? 'standby'
  const isGlobe = viewMode === 'globe'

  return (
    <section
      className={isGlobe ? 'map-stage map-stage--globe' : 'map-stage'}
      aria-label="Operational map"
    >
      <CesiumGlobe
        correlatedSignalIds={correlatedSignalIds}
        displayMode={viewMode}
        focusSignalId={focusSignalId}
        signals={signals}
      />
      <div className="map-view-toggle" aria-label="View mode">
        <button
          className={!isGlobe ? 'is-active' : ''}
          onClick={() => setViewMode('nav')}
          type="button"
        >
          Nav View
        </button>
        <button
          className={isGlobe ? 'is-active' : ''}
          onClick={() => setViewMode('globe')}
          type="button"
        >
          Globe View
        </button>
      </div>
      <div className="tak-map-chrome" aria-hidden="true">
        <div>
          <span>{isGlobe ? 'SPACE' : 'AOR'}</span>
          <strong>{isGlobe ? 'CSM CUSTODY' : 'CANOPY COP'}</strong>
        </div>
        <em>
          {isGlobe
            ? `${correlatedSignalIds.length.toString().padStart(2, '0')} fused tracks`
            : `${signals.length.toString().padStart(2, '0')} CoT feeds`}
        </em>
      </div>
      {isGlobe ? (
        <div className="space-hud" aria-hidden="true">
          <div>
            <span>Custody</span>
            <strong>LEO / MEO</strong>
          </div>
          <div>
            <span>TLE age</span>
            <strong>cached</strong>
          </div>
          <div>
            <span>Threat layer</span>
            <strong>RPO + EW</strong>
          </div>
        </div>
      ) : null}
      <div className="tak-map-strip" aria-hidden="true">
        <span>{isGlobe ? 'TEME / ECEF custody overlay' : 'MGRS 38S MB 4287 7319'}</span>
        <span>{isGlobe ? 'TLE cache live' : 'Link live'}</span>
        <span>{isGlobe ? 'Orbital threat layer' : 'Space overlay'}</span>
      </div>
      <div className="map-stage__readout">
        <span>{latestDomain}</span>
        <strong>{latestLabel}</strong>
      </div>
    </section>
  )
}
