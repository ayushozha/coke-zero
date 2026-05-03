import {
  Cartesian2,
  Cartesian3,
  Color,
  HeadingPitchRange,
  LabelStyle,
  NearFarScalar,
  Viewer,
} from 'cesium'

export const N2YO_SATELLITE_ID = 45465
export const N2YO_SATELLITE_CACHE_URL = '/orbital/n2yo_45465_positions.json'

const MAP_FONT =
  '12px "Aptos Display", Aptos, "IBM Plex Sans Condensed", "IBM Plex Sans", "SF Pro Text", ui-sans-serif, system-ui, sans-serif'
const MAP_PANEL = Color.fromCssColorString('#091112')
const REAL_SATELLITE_COLOR = Color.fromCssColorString('#33f2f0')
const DISPLAY_ALTITUDE_M = 720000

type N2YOTrackPoint = {
  timestamp: number
  timestamp_utc: string
  lat: number
  lng: number
  alt_km: number
}

export type N2YOPositionCache = {
  fetched_at: string
  satellite: {
    id: number
    name: string
  }
  track: N2YOTrackPoint[]
}

export type N2YOLayerState = {
  entityIds: string[]
  point: N2YOTrackPoint
  satelliteName: string
}

const realSatelliteMarker = () =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 38 38">
      <filter id="g" x="-70%" y="-70%" width="240%" height="240%">
        <feDropShadow dx="0" dy="1" stdDeviation="1.8" flood-color="#000000" flood-opacity="0.78"/>
        <feDropShadow dx="0" dy="0" stdDeviation="2.8" flood-color="#33f2f0" flood-opacity="0.42"/>
      </filter>
      <g fill="rgba(2,4,4,0.78)" stroke="#33f2f0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#g)">
        <path d="M19 4l15 29H4z"/>
        <path d="M19 12v10M19 27v1"/>
      </g>
    </svg>`,
  )}`

const latestTrackPoint = (cache: N2YOPositionCache) =>
  cache.track.reduce((latest, point) =>
    point.timestamp > latest.timestamp ? point : latest,
  )

const formatUtcTime = (timestampUtc: string) =>
  new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(new Date(timestampUtc))

export async function fetchN2YOPositionCache(): Promise<N2YOPositionCache> {
  const response = await fetch(`${N2YO_SATELLITE_CACHE_URL}?ts=${Date.now()}`)
  if (!response.ok) {
    throw new Error(`failed to load N2YO cache: HTTP ${response.status}`)
  }

  const cache = (await response.json()) as N2YOPositionCache
  if (!Array.isArray(cache.track) || cache.track.length === 0) {
    throw new Error('N2YO cache did not contain track points')
  }

  return cache
}

export function clearN2YOSatelliteLayer(
  viewer: Viewer,
  layer: N2YOLayerState | null,
) {
  layer?.entityIds.forEach((id) => viewer.entities.removeById(id))
}

export function addN2YOSatelliteLayer(
  viewer: Viewer,
  cache: N2YOPositionCache,
): N2YOLayerState {
  const point = latestTrackPoint(cache)
  const satelliteName = cache.satellite.name || `NORAD ${N2YO_SATELLITE_ID}`
  const position = Cartesian3.fromDegrees(point.lng, point.lat, DISPLAY_ALTITUDE_M)
  const footprintPosition = Cartesian3.fromDegrees(point.lng, point.lat, 0)
  const entityIds = [
    `n2yo-${N2YO_SATELLITE_ID}-satellite`,
    `n2yo-${N2YO_SATELLITE_ID}-footprint`,
  ]

  clearN2YOSatelliteLayer(viewer, { entityIds, point, satelliteName })

  viewer.entities.add({
    id: entityIds[0],
    name: `REAL N2YO ${satelliteName}`,
    position,
    billboard: {
      color: Color.WHITE,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      height: 34,
      image: realSatelliteMarker(),
      scaleByDistance: new NearFarScalar(1500000, 1, 25000000, 0.42),
      width: 34,
    },
    label: {
      backgroundColor: MAP_PANEL.withAlpha(0.9),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      fillColor: Color.WHITE,
      font: MAP_FONT,
      pixelOffset: new Cartesian2(0, -42),
      scaleByDistance: new NearFarScalar(1500000, 1, 25000000, 0.58),
      show: true,
      showBackground: true,
      style: LabelStyle.FILL,
      text: `REAL N2YO\n${satelliteName}\nNORAD ${cache.satellite.id}\nTRUE ALT ${Math.round(point.alt_km).toLocaleString()} km\n${formatUtcTime(point.timestamp_utc)}`,
    },
    description: `N2YO live position for NORAD ${cache.satellite.id}. True altitude ${point.alt_km.toFixed(2)} km; displayed at ${(DISPLAY_ALTITUDE_M / 1000).toFixed(0)} km for scene readability.`,
  })

  viewer.entities.add({
    id: entityIds[1],
    name: `${satelliteName} sub-satellite point`,
    position: footprintPosition,
    ellipse: {
      semiMajorAxis: 160000,
      semiMinorAxis: 160000,
      material: REAL_SATELLITE_COLOR.withAlpha(0.04),
      outline: true,
      outlineColor: REAL_SATELLITE_COLOR.withAlpha(0.45),
    },
  })

  return { entityIds, point, satelliteName }
}

export function flyToN2YOSatellite(viewer: Viewer, layer: N2YOLayerState) {
  const entity = viewer.entities.getById(layer.entityIds[0])
  if (!entity) {
    return
  }

  void viewer.flyTo(entity, {
    duration: 0.6,
    offset: new HeadingPitchRange(0, -0.55, 3600000),
  })
}
