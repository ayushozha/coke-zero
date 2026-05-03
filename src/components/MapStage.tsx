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
  return (
    <section className="map-stage" aria-label="Operational map">
      <CesiumGlobe
        correlatedSignalIds={correlatedSignalIds}
        focusSignalId={focusSignalId}
        signals={signals}
      />
      <div className="map-stage__readout">
        <span>{latestSignal ? latestSignal.domain : 'Continuous Cesium'}</span>
        <strong>
          {latestSignal?.location.label ??
            latestSignal?.payload.asset ??
            'Globe to AOR'}
        </strong>
      </div>
    </section>
  )
}
