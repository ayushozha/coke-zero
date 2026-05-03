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
  const latestLabel =
    latestSignal?.location.label ?? latestSignal?.payload.asset ?? 'No focus'
  const latestDomain = latestSignal?.domain.replaceAll('_', ' ') ?? 'standby'

  return (
    <section className="map-stage" aria-label="Operational map">
      <CesiumGlobe
        correlatedSignalIds={correlatedSignalIds}
        focusSignalId={focusSignalId}
        signals={signals}
      />
      <div className="tak-map-chrome" aria-hidden="true">
        <div>
          <span>AOR</span>
          <strong>CANOPY COP</strong>
        </div>
        <em>{signals.length.toString().padStart(2, '0')} CoT feeds</em>
      </div>
      <div className="tak-map-strip" aria-hidden="true">
        <span>MGRS 38S MB 4287 7319</span>
        <span>Link live</span>
        <span>Space overlay</span>
      </div>
      <div className="map-stage__readout">
        <span>{latestDomain}</span>
        <strong>{latestLabel}</strong>
      </div>
    </section>
  )
}
