import { useState } from 'react'
import { AorMap } from './AorMap'
import { CesiumGlobe } from './CesiumGlobe'

export function MapStage() {
  const [view, setView] = useState<'globe' | 'aor'>('globe')

  return (
    <section className="map-stage" aria-label="Operational map">
      {view === 'globe' ? (
        <CesiumGlobe onOpenAor={() => setView('aor')} />
      ) : (
        <AorMap />
      )}
      <div className="map-stage__view-switch" aria-label="Map view">
        <button
          className={view === 'globe' ? 'is-active' : ''}
          onClick={() => setView('globe')}
          type="button"
        >
          Globe
        </button>
        <button
          className={view === 'aor' ? 'is-active' : ''}
          onClick={() => setView('aor')}
          type="button"
        >
          AOR
        </button>
      </div>
      <div className="map-stage__readout">
        <span>{view === 'globe' ? 'North Axis' : 'Local AOR'}</span>
        <strong>{view === 'globe' ? 'SAT-BRAVO' : 'Relay Team 2'}</strong>
      </div>
    </section>
  )
}
