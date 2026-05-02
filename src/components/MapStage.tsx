import { CesiumGlobe } from './CesiumGlobe'

export function MapStage() {
  return (
    <section className="map-stage" aria-label="Operational map">
      <CesiumGlobe />
      <div className="map-stage__readout">
        <span>Continuous Cesium</span>
        <strong>Globe to AOR</strong>
      </div>
    </section>
  )
}
