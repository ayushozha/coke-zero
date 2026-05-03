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
            : `${signals.length.toString().padStart(2, '0')} feeds`}
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
      {!isGlobe ? (
        <>
          <div className="nav-crosshair" aria-hidden="true" />
          <div className="nav-inset" aria-hidden="true">
            <span>LIVE FEED / UAV-09</span>
            <strong>5D SECTOR OPS</strong>
          </div>
          <div className="nav-tools" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
        </>
      ) : null}
      <div className="map-stage__readout">
        <span>{latestDomain}</span>
        <strong>{latestLabel}</strong>
      </div>
    </section>
  )
}
