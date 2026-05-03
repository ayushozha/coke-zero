import {
  Cartesian2,
  Cartesian3,
  Color,
  ConstantProperty,
  HeadingPitchRange,
  LabelStyle,
  NearFarScalar,
  PolylineDashMaterialProperty,
  Viewer,
} from 'cesium'

export type N2YOSatelliteConfig = {
  family: N2YOSatelliteFamily
  id: number
  label: string
  cacheUrl: string
}

export type N2YOSatelliteFamily =
  | 'AEHF'
  | 'MUOS'
  | 'WGS'
  | 'SBIRS'
  | 'GSSAP'
  | 'GPS-3'

export const isN2YOGeostationaryFamily = (family: N2YOSatelliteFamily) =>
  family === 'AEHF' ||
  family === 'MUOS' ||
  family === 'WGS' ||
  family === 'SBIRS' ||
  family === 'GSSAP'

export const N2YO_SATELLITES: N2YOSatelliteConfig[] = [
  {
    family: 'AEHF',
    id: 36868,
    label: 'AEHF 1',
    cacheUrl: '/orbital/n2yo_36868_positions.json',
  },
  {
    family: 'AEHF',
    id: 38254,
    label: 'AEHF 2',
    cacheUrl: '/orbital/n2yo_38254_positions.json',
  },
  {
    family: 'AEHF',
    id: 39256,
    label: 'AEHF 3',
    cacheUrl: '/orbital/n2yo_39256_positions.json',
  },
  {
    family: 'AEHF',
    id: 43651,
    label: 'AEHF 4',
    cacheUrl: '/orbital/n2yo_43651_positions.json',
  },
  {
    family: 'AEHF',
    id: 44481,
    label: 'AEHF 5',
    cacheUrl: '/orbital/n2yo_44481_positions.json',
  },
  {
    family: 'AEHF',
    id: 45465,
    label: 'AEHF 6',
    cacheUrl: '/orbital/n2yo_45465_positions.json',
  },
  {
    family: 'MUOS',
    id: 38093,
    label: 'MUOS 1',
    cacheUrl: '/orbital/n2yo_38093_positions.json',
  },
  {
    family: 'MUOS',
    id: 39206,
    label: 'MUOS 2',
    cacheUrl: '/orbital/n2yo_39206_positions.json',
  },
  {
    family: 'MUOS',
    id: 40374,
    label: 'MUOS 3',
    cacheUrl: '/orbital/n2yo_40374_positions.json',
  },
  {
    family: 'MUOS',
    id: 40887,
    label: 'MUOS 4',
    cacheUrl: '/orbital/n2yo_40887_positions.json',
  },
  {
    family: 'MUOS',
    id: 41622,
    label: 'MUOS 5',
    cacheUrl: '/orbital/n2yo_41622_positions.json',
  },
  {
    family: 'WGS',
    id: 32258,
    label: 'WGS 1',
    cacheUrl: '/orbital/n2yo_32258_positions.json',
  },
  {
    family: 'WGS',
    id: 34713,
    label: 'WGS 2',
    cacheUrl: '/orbital/n2yo_34713_positions.json',
  },
  {
    family: 'WGS',
    id: 36108,
    label: 'WGS 3',
    cacheUrl: '/orbital/n2yo_36108_positions.json',
  },
  {
    family: 'WGS',
    id: 38070,
    label: 'WGS 4',
    cacheUrl: '/orbital/n2yo_38070_positions.json',
  },
  {
    family: 'WGS',
    id: 39168,
    label: 'WGS 5',
    cacheUrl: '/orbital/n2yo_39168_positions.json',
  },
  {
    family: 'WGS',
    id: 39222,
    label: 'WGS 6',
    cacheUrl: '/orbital/n2yo_39222_positions.json',
  },
  {
    family: 'WGS',
    id: 40746,
    label: 'WGS 7',
    cacheUrl: '/orbital/n2yo_40746_positions.json',
  },
  {
    family: 'SBIRS',
    id: 37481,
    label: 'SBIRS-GEO 1',
    cacheUrl: '/orbital/n2yo_37481_positions.json',
  },
  {
    family: 'SBIRS',
    id: 39120,
    label: 'SBIRS-GEO 2',
    cacheUrl: '/orbital/n2yo_39120_positions.json',
  },
  {
    family: 'SBIRS',
    id: 41937,
    label: 'SBIRS-GEO 3',
    cacheUrl: '/orbital/n2yo_41937_positions.json',
  },
  {
    family: 'SBIRS',
    id: 43162,
    label: 'SBIRS-GEO 4',
    cacheUrl: '/orbital/n2yo_43162_positions.json',
  },
  {
    family: 'SBIRS',
    id: 48618,
    label: 'SBIRS-GEO 5',
    cacheUrl: '/orbital/n2yo_48618_positions.json',
  },
  {
    family: 'SBIRS',
    id: 53355,
    label: 'SBIRS-GEO 6',
    cacheUrl: '/orbital/n2yo_53355_positions.json',
  },
  {
    family: 'GSSAP',
    id: 40099,
    label: 'GSSAP 1',
    cacheUrl: '/orbital/n2yo_40099_positions.json',
  },
  {
    family: 'GSSAP',
    id: 40100,
    label: 'GSSAP 2',
    cacheUrl: '/orbital/n2yo_40100_positions.json',
  },
  {
    family: 'GSSAP',
    id: 41744,
    label: 'GSSAP 3',
    cacheUrl: '/orbital/n2yo_41744_positions.json',
  },
  {
    family: 'GSSAP',
    id: 41745,
    label: 'GSSAP 4',
    cacheUrl: '/orbital/n2yo_41745_positions.json',
  },
  {
    family: 'GPS-3',
    id: 43873,
    label: 'GPS-3 1',
    cacheUrl: '/orbital/n2yo_43873_positions.json',
  },
  {
    family: 'GPS-3',
    id: 44506,
    label: 'GPS-3 2',
    cacheUrl: '/orbital/n2yo_44506_positions.json',
  },
  {
    family: 'GPS-3',
    id: 45854,
    label: 'GPS-3 3',
    cacheUrl: '/orbital/n2yo_45854_positions.json',
  },
  {
    family: 'GPS-3',
    id: 46826,
    label: 'GPS-3 4',
    cacheUrl: '/orbital/n2yo_46826_positions.json',
  },
  {
    family: 'GPS-3',
    id: 48859,
    label: 'GPS-3 5',
    cacheUrl: '/orbital/n2yo_48859_positions.json',
  },
  {
    family: 'GPS-3',
    id: 55268,
    label: 'GPS-3 6',
    cacheUrl: '/orbital/n2yo_55268_positions.json',
  },
  {
    family: 'GPS-3',
    id: 62339,
    label: 'GPS-3 7',
    cacheUrl: '/orbital/n2yo_62339_positions.json',
  },
  {
    family: 'GPS-3',
    id: 64202,
    label: 'GPS-3 8',
    cacheUrl: '/orbital/n2yo_64202_positions.json',
  },
  {
    family: 'GPS-3',
    id: 67588,
    label: 'GPS-3 9',
    cacheUrl: '/orbital/n2yo_67588_positions.json',
  },
]

const MAP_FONT =
  '12px "Aptos Display", Aptos, "IBM Plex Sans Condensed", "IBM Plex Sans", "SF Pro Text", ui-sans-serif, system-ui, sans-serif'
const MAP_PANEL = Color.fromCssColorString('#091112')
const REAL_SATELLITE_COLOR = Color.fromCssColorString('#33f2f0')
const DISPLAY_ALTITUDE_M = 720000
const ORBIT_SAMPLE_COUNT = 240

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
  orbit?: N2YOTrackPoint[]
  tle?: {
    line1: string
    line2: string
  }
}

export type N2YOLayerState = {
  cache: N2YOPositionCache
  entityIds: string[]
  point: N2YOTrackPoint
  satelliteFamily: N2YOSatelliteFamily
  satelliteId: number
  satelliteName: string
}

export const orbitEntityIdForSatellite = (satelliteId: number) =>
  `n2yo-${satelliteId}-orbit`

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

const toRadians = (degrees: number) => (degrees * Math.PI) / 180

const vectorFromPoint = (point: N2YOTrackPoint) => {
  const lat = toRadians(point.lat)
  const lon = toRadians(point.lng)
  const cosLat = Math.cos(lat)
  return {
    x: cosLat * Math.cos(lon),
    y: cosLat * Math.sin(lon),
    z: Math.sin(lat),
  }
}

const dot = (
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
) => a.x * b.x + a.y * b.y + a.z * b.z

const normalize = (v: { x: number; y: number; z: number }) => {
  const magnitude = Math.hypot(v.x, v.y, v.z) || 1
  return {
    x: v.x / magnitude,
    y: v.y / magnitude,
    z: v.z / magnitude,
  }
}

const createSampledMotionOrbitPositions = (track: N2YOTrackPoint[]) => {
  const selectedPoint = latestTrackPoint({
    fetched_at: '',
    satellite: { id: 0, name: '' },
    track,
  })
  const selectedIndex = Math.max(
    track.findIndex((point) => point.timestamp === selectedPoint.timestamp),
    0,
  )
  const previousPoint = track[Math.max(selectedIndex - 1, 0)]
  const nextPoint = track[Math.min(selectedIndex + 1, track.length - 1)]
  const reference =
    nextPoint.timestamp !== selectedPoint.timestamp ? nextPoint : previousPoint
  const current = vectorFromPoint(selectedPoint)
  let tangent = {
    x: vectorFromPoint(reference).x - current.x,
    y: vectorFromPoint(reference).y - current.y,
    z: vectorFromPoint(reference).z - current.z,
  }
  const radialComponent = dot(tangent, current)
  tangent = normalize({
    x: tangent.x - radialComponent * current.x,
    y: tangent.y - radialComponent * current.y,
    z: tangent.z - radialComponent * current.z,
  })

  if (Math.hypot(tangent.x, tangent.y, tangent.z) < 0.000001) {
    tangent = normalize({ x: -current.y, y: current.x, z: 0 })
  }

  const positions: Cartesian3[] = []
  for (let index = 0; index <= ORBIT_SAMPLE_COUNT; index += 1) {
    const theta = (index / ORBIT_SAMPLE_COUNT) * Math.PI * 2
    const sample = normalize({
      x: current.x * Math.cos(theta) + tangent.x * Math.sin(theta),
      y: current.y * Math.cos(theta) + tangent.y * Math.sin(theta),
      z: current.z * Math.cos(theta) + tangent.z * Math.sin(theta),
    })
    positions.push(
      Cartesian3.fromRadians(
        Math.atan2(sample.y, sample.x),
        Math.asin(sample.z),
        DISPLAY_ALTITUDE_M,
      ),
    )
  }
  return positions
}

export async function fetchN2YOPositionCache(
  config: N2YOSatelliteConfig,
): Promise<N2YOPositionCache> {
  const response = await fetch(`${config.cacheUrl}?ts=${Date.now()}`)
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
  layer: Pick<N2YOLayerState, 'entityIds'> | null,
) {
  layer?.entityIds.forEach((id) => viewer.entities.removeById(id))
}

export function addN2YOSatellite(
  viewer: Viewer,
  cache: N2YOPositionCache,
  config: N2YOSatelliteConfig,
): N2YOLayerState {
  const point = latestTrackPoint(cache)
  const satelliteId = cache.satellite.id
  const satelliteName = config.label || cache.satellite.name || `NORAD ${satelliteId}`
  const position = Cartesian3.fromDegrees(point.lng, point.lat, DISPLAY_ALTITUDE_M)
  const footprintPosition = Cartesian3.fromDegrees(point.lng, point.lat, 0)
  const entityIds = [
    `n2yo-${satelliteId}-satellite`,
    `n2yo-${satelliteId}-footprint`,
  ]

  clearN2YOSatelliteLayer(viewer, { entityIds })

  viewer.entities.add({
    id: entityIds[0],
    name: `REAL N2YO ${satelliteName}`,
    position,
    billboard: {
      color: Color.WHITE,
      disableDepthTestDistance: 0,
      height: 34,
      image: realSatelliteMarker(),
      scaleByDistance: new NearFarScalar(1500000, 1, 25000000, 0.42),
      width: 34,
    },
    label: {
      backgroundColor: MAP_PANEL.withAlpha(0.9),
      disableDepthTestDistance: 0,
      fillColor: Color.WHITE,
      font: MAP_FONT,
      pixelOffset: new Cartesian2(0, -42),
      scaleByDistance: new NearFarScalar(1500000, 1, 25000000, 0.58),
      show: false,
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

  return {
    cache,
    entityIds,
    point,
    satelliteFamily: config.family,
    satelliteId,
    satelliteName,
  }
}

export function clearN2YOSatelliteLayers(
  viewer: Viewer,
  layers: N2YOLayerState[],
) {
  layers.forEach((layer) => {
    hideN2YOOrbit(viewer, layer)
    clearN2YOSatelliteLayer(viewer, layer)
  })
}

export function selectN2YOSatellite(
  viewer: Viewer,
  layer: N2YOLayerState,
) {
  const entity = viewer.entities.getById(layer.entityIds[0])
  if (!entity) {
    return []
  }

  entity.label!.show = new ConstantProperty(true)

  showN2YOOrbit(viewer, layer)

  void viewer.flyTo(entity, {
    duration: 0.6,
    offset: new HeadingPitchRange(0, -0.55, 3600000),
  })

  return [orbitEntityIdForSatellite(layer.satelliteId)]
}

export function deselectN2YOSatellite(viewer: Viewer, layer: N2YOLayerState) {
  const entity = viewer.entities.getById(layer.entityIds[0])
  if (entity?.label) {
    entity.label.show = new ConstantProperty(false)
  }
  hideN2YOOrbit(viewer, layer)
}

export function showN2YOOrbit(viewer: Viewer, layer: N2YOLayerState) {
  if (isN2YOGeostationaryFamily(layer.satelliteFamily)) {
    hideN2YOOrbit(viewer, layer)
    return
  }

  const orbitId = orbitEntityIdForSatellite(layer.satelliteId)
  viewer.entities.removeById(orbitId)
  const positions = createSampledMotionOrbitPositions(layer.cache.track)
  if (positions.length <= 1) {
    return
  }

  viewer.entities.add({
    id: orbitId,
    name: `${layer.satelliteName} orbital path`,
    polyline: {
      clampToGround: false,
      material: new PolylineDashMaterialProperty({
        color: Color.fromCssColorString('#c9a457').withAlpha(0.86),
        dashLength: 18,
      }),
      positions,
      width: 2,
    },
  })
}

export function hideN2YOOrbit(viewer: Viewer, layer: N2YOLayerState) {
  viewer.entities.removeById(orbitEntityIdForSatellite(layer.satelliteId))
}

export function setN2YOSatelliteLayerVisible(
  viewer: Viewer,
  layer: N2YOLayerState,
  visible: boolean,
) {
  layer.entityIds.forEach((id) => {
    const entity = viewer.entities.getById(id)
    if (entity) {
      entity.show = visible
    }
  })

  if (!visible) {
    hideN2YOOrbit(viewer, layer)
  }
}

export function setN2YOOrbitsVisible(
  viewer: Viewer,
  layers: N2YOLayerState[],
  visible: boolean,
) {
  layers.forEach((layer) => {
    if (visible) {
      showN2YOOrbit(viewer, layer)
    } else {
      hideN2YOOrbit(viewer, layer)
    }
  })
}
