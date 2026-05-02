import { CesiumGlobe } from './CesiumGlobe'

export function MapStage() {
  return (
    <section className="map-stage" aria-label="Operational map">
      <CesiumGlobe />
      <div className="map-stage__readout">
        <span>North Axis</span>
        <strong>SAT-BRAVO</strong>
      </div>
      <div className="map-stage__mode">Cesium Globe</div>
    </section>
  )
}
