export function MapStage() {
  return (
    <section className="map-stage" aria-label="Operational map">
      <div className="map-stage__globe" aria-hidden="true">
        <span className="map-stage__ring map-stage__ring--outer" />
        <span className="map-stage__ring map-stage__ring--inner" />
        <span className="map-stage__axis map-stage__axis--vertical" />
        <span className="map-stage__axis map-stage__axis--horizontal" />
        <span className="map-stage__contact map-stage__contact--satcom" />
        <span className="map-stage__contact map-stage__contact--pnt" />
        <span className="map-stage__contact map-stage__contact--rf" />
      </div>
      <div className="map-stage__readout">
        <span>North Axis</span>
        <strong>SAT-BRAVO</strong>
      </div>
    </section>
  )
}
