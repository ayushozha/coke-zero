import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { forward as toMgrs, toPoint as mgrsToPoint } from 'mgrs'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { ScenarioDefinition } from '../data/scenarioLibrary'
import type { Signal } from '../types/canopy'

type Basemap = 'imagery' | 'streets'
type AorMapProps = {
  correlatedSignalIds: string[]
  focusSignalId: string | null
  scenario: ScenarioDefinition
  signals: Signal[]
}

const aorCenter: [number, number] = [-116.52, 35.02]

const relayRoute: [number, number][] = [
  [-116.57, 35.0],
  [-116.55, 35.015],
  [-116.52, 35.02],
  [-116.49, 35.035],
  [-116.46, 35.05],
]

const aorBounds = {
  west: -116.61,
  south: 34.98,
  east: -116.43,
  north: 35.08,
}

type AorBounds = typeof aorBounds

const formatMgrs = ([lon, lat]: [number, number]) => {
  if (
    !Number.isFinite(lon) ||
    !Number.isFinite(lat) ||
    lat < -80 ||
    lat > 84
  ) {
    const latLabel = `${Math.abs(lat).toFixed(2)}${lat >= 0 ? 'N' : 'S'}`
    const lonLabel = `${Math.abs(lon).toFixed(2)}${lon >= 0 ? 'E' : 'W'}`
    return `${latLabel} ${lonLabel}`
  }

  return toMgrs([lon, lat], 4).replace(
    /^(\d{1,2}[A-Z])([A-Z]{2})(\d{4})(\d{4})$/,
    '$1 $2 $3 $4',
  )
}

const signalPoint = (signal: Signal): [number, number] | null => {
  if (
    typeof signal.location.lng === 'number' &&
    typeof signal.location.lat === 'number'
  ) {
    return [signal.location.lng, signal.location.lat]
  }

  if (!signal.location.mgrs) {
    const match = signal.location.area_wkt?.match(/POLYGON\s*\(\((.+)\)\)/i)
    if (!match) {
      return null
    }

    const points = match[1]
      .split(',')
      .map((pair) => pair.trim().split(/\s+/).map(Number))
      .filter(
        (point): point is [number, number] =>
          point.length === 2 &&
          Number.isFinite(point[0]) &&
          Number.isFinite(point[1]),
      )

    if (!points.length) {
      return null
    }

    const [lonTotal, latTotal] = points.reduce(
      ([lonSum, latSum], [lon, lat]) => [lonSum + lon, latSum + lat],
      [0, 0],
    )

    return [lonTotal / points.length, latTotal / points.length]
  }

  try {
    const [lon, lat] = mgrsToPoint(signal.location.mgrs)
    return [lon, lat]
  } catch {
    return null
  }
}

const labelForSignal = (signal: Signal) =>
  signal.location.label ??
  signal.payload.asset ??
  signal.payload.event_type.replaceAll('_', ' ').toUpperCase()

const priorityForSignal = (signal: Signal) => {
  if (signal.confidence >= 0.86) {
    return 'high'
  }
  if (signal.confidence >= 0.74) {
    return 'watch'
  }
  return 'low'
}

const priorityLabel = (priority: ReturnType<typeof priorityForSignal>) => {
  if (priority === 'high') {
    return 'THREAT'
  }
  if (priority === 'watch') {
    return 'WATCH'
  }
  return 'TRACK'
}

const boundsFromPoints = (points: [number, number][]): AorBounds => {
  if (!points.length) {
    return aorBounds
  }

  const lons = points.map(([lon]) => lon)
  const lats = points.map(([, lat]) => lat)
  const west = Math.min(...lons)
  const east = Math.max(...lons)
  const south = Math.min(...lats)
  const north = Math.max(...lats)
  const lonPad = Math.max((east - west) * 0.28, 0.08)
  const latPad = Math.max((north - south) * 0.28, 0.08)

  return {
    west: west - lonPad,
    south: south - latPad,
    east: east + lonPad,
    north: north + latPad,
  }
}

const centerFromBounds = (bounds: AorBounds): [number, number] => [
  (bounds.west + bounds.east) / 2,
  (bounds.south + bounds.north) / 2,
]

const createAorPolygon = (bounds: AorBounds) =>
  ({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [bounds.west, bounds.south],
              [bounds.east, bounds.south],
              [bounds.east, bounds.north],
              [bounds.west, bounds.north],
              [bounds.west, bounds.south],
            ],
          ],
        },
      },
    ],
  }) as GeoJSON.FeatureCollection

const createRoute = (points: [number, number][]) =>
  ({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: points.length > 1 ? points : relayRoute,
        },
      },
    ],
  }) as GeoJSON.FeatureCollection

const createGrid = (bounds: AorBounds) => {
  const features: GeoJSON.Feature[] = []
  const step = 0.01

  for (
    let lon = Math.ceil(bounds.west / step) * step;
    lon <= bounds.east;
    lon += step
  ) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [Number(lon.toFixed(5)), bounds.south],
          [Number(lon.toFixed(5)), bounds.north],
        ],
      },
    })
  }

  for (
    let lat = Math.ceil(bounds.south / step) * step;
    lat <= bounds.north;
    lat += step
  ) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [bounds.west, Number(lat.toFixed(5))],
          [bounds.east, Number(lat.toFixed(5))],
        ],
      },
    })
  }

  return {
    type: 'FeatureCollection',
    features,
  } as GeoJSON.FeatureCollection
}

export function AorMap({
  correlatedSignalIds,
  focusSignalId,
  scenario,
  signals,
}: AorMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const signalMarkersRef = useRef<maplibregl.Marker[]>([])
  const [isMapReady, setIsMapReady] = useState(false)
  const [basemap, setBasemap] = useState<Basemap>('streets')
  const [cursorGrid, setCursorGrid] = useState(formatMgrs(aorCenter))
  const [zoom, setZoom] = useState('15.2')

  const scenarioCoordinateSignals = useMemo(
    () =>
      scenario.signals
        .map((signal) => ({ point: signalPoint(signal), signal }))
        .filter(
          (entry): entry is { point: [number, number]; signal: Signal } =>
            entry.point !== null,
        ),
    [scenario.signals],
  )
  const coordinateSignals = useMemo(
    () =>
      signals
        .map((signal) => ({ point: signalPoint(signal), signal }))
        .filter(
          (entry): entry is { point: [number, number]; signal: Signal } =>
            entry.point !== null,
        ),
    [signals],
  )
  const routePoints = useMemo(
    () => scenarioCoordinateSignals.map(({ point }) => point),
    [scenarioCoordinateSignals],
  )
  const operationalBounds = useMemo(
    () => boundsFromPoints(scenarioCoordinateSignals.map(({ point }) => point)),
    [scenarioCoordinateSignals],
  )

  const visibleSignals = useMemo(
    () =>
      [...coordinateSignals]
        .sort((a, b) => {
          const focusScore = (signal: Signal) =>
            signal.id === focusSignalId ? 1 : 0
          const correlatedScore = (signal: Signal) =>
            correlatedSignalIds.includes(signal.id) ? 1 : 0

          return (
            focusScore(b.signal) - focusScore(a.signal) ||
            correlatedScore(b.signal) - correlatedScore(a.signal) ||
            b.signal.confidence - a.signal.confidence
          )
        })
        .slice(0, 8),
    [coordinateSignals, correlatedSignalIds, focusSignalId],
  )
  const leadSignal = visibleSignals[0]?.signal
  const leadPriority = leadSignal ? priorityForSignal(leadSignal) : 'low'
  const highSignalCount = visibleSignals.filter(
    ({ signal }) => priorityForSignal(signal) === 'high',
  ).length

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    const map = new maplibregl.Map({
      attributionControl: false,
      center: centerFromBounds(aorBounds),
      container: containerRef.current,
      maxZoom: 19,
      minZoom: 12,
      pitch: 0,
      style: {
        version: 8,
        sources: {
          esriWorldImagery: {
            type: 'raster',
            tiles: [
              'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            ],
            tileSize: 256,
            maxzoom: 19,
            attribution:
              'Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
          },
          osmStreets: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            maxzoom: 19,
            attribution: 'OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'imagery',
            type: 'raster',
            source: 'esriWorldImagery',
            layout: {
              visibility: 'none',
            },
            paint: {
              'raster-brightness-max': 0.58,
              'raster-brightness-min': 0.03,
              'raster-contrast': 0.2,
              'raster-fade-duration': 0,
              'raster-saturation': -0.28,
            },
          },
          {
            id: 'streets',
            type: 'raster',
            source: 'osmStreets',
            paint: {
              'raster-brightness-max': 0.52,
              'raster-brightness-min': 0,
              'raster-contrast': 0.26,
              'raster-fade-duration': 0,
              'raster-saturation': -0.95,
            },
          },
        ],
      },
      zoom: 15.2,
    })

    mapRef.current = map
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      'bottom-left',
    )

    map.on('load', () => {
      setIsMapReady(true)
      map.addSource('aor-zone', {
        type: 'geojson',
        data: createAorPolygon(aorBounds),
      })
      map.addLayer({
        id: 'aor-zone-fill',
        type: 'fill',
        source: 'aor-zone',
        paint: {
          'fill-color': '#e05c4f',
          'fill-opacity': 0.045,
        },
      })
      map.addLayer({
        id: 'aor-zone-line',
        type: 'line',
        source: 'aor-zone',
        paint: {
          'line-color': '#e05c4f',
          'line-opacity': 0.64,
          'line-width': 1.4,
        },
      })

      map.addSource('mgrs-grid', {
        type: 'geojson',
        data: createGrid(aorBounds),
      })
      map.addLayer({
        id: 'mgrs-grid-line',
        type: 'line',
        source: 'mgrs-grid',
        paint: {
          'line-color': '#ffffff',
          'line-opacity': 0.22,
          'line-width': 1,
        },
      })

      map.addSource('relay-route', {
        type: 'geojson',
        data: createRoute([]),
      })
      map.addLayer({
        id: 'relay-route-line',
        type: 'line',
        source: 'relay-route',
        paint: {
          'line-color': '#c9a457',
          'line-opacity': 0.78,
          'line-width': 2.2,
          'line-dasharray': [1.8, 1.2],
        },
      })

    })

    map.on('mousemove', (event) => {
      setCursorGrid(formatMgrs([event.lngLat.lng, event.lngLat.lat]))
    })

    map.on('zoom', () => {
      setZoom(map.getZoom().toFixed(1))
    })

    return () => {
      signalMarkersRef.current.forEach((marker) => marker.remove())
      signalMarkersRef.current = []
      map.remove()
      mapRef.current = null
      setIsMapReady(false)
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isMapReady) {
      return
    }

    setCursorGrid(formatMgrs(centerFromBounds(operationalBounds)))
    ;(map.getSource('aor-zone') as maplibregl.GeoJSONSource | undefined)?.setData(
      createAorPolygon(operationalBounds),
    )
    ;(map.getSource('mgrs-grid') as maplibregl.GeoJSONSource | undefined)?.setData(
      createGrid(operationalBounds),
    )
    ;(map.getSource('relay-route') as maplibregl.GeoJSONSource | undefined)?.setData(
      createRoute(routePoints),
    )
    map.fitBounds(
      [
        [operationalBounds.west, operationalBounds.south],
        [operationalBounds.east, operationalBounds.north],
      ],
      { duration: 420, maxZoom: 15.2, padding: 92 },
    )
  }, [isMapReady, operationalBounds, routePoints, scenario.id])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isMapReady) {
      return
    }

    signalMarkersRef.current.forEach((marker) => marker.remove())
    signalMarkersRef.current = visibleSignals.map(({ point, signal }) => {
      const priority = priorityForSignal(signal)
      const marker = document.createElement('div')
      marker.className = [
        'aor-signal',
        `aor-signal--${priority}`,
        signal.id === focusSignalId ? 'aor-signal--focus' : '',
        correlatedSignalIds.includes(signal.id) ? 'aor-signal--correlated' : '',
      ]
        .filter(Boolean)
        .join(' ')
      marker.title = `${labelForSignal(signal)} / ${formatMgrs(point)}`

      const glyph = document.createElement('span')
      glyph.className = 'aor-signal__glyph'
      marker.appendChild(glyph)

      const label = document.createElement('span')
      label.className = 'aor-signal__label'
      label.textContent = labelForSignal(signal)
      marker.appendChild(label)

      const meta = document.createElement('span')
      meta.className = 'aor-signal__meta'
      meta.textContent = `${signal.domain.toUpperCase()} ${Math.round(
        signal.confidence * 100,
      )}%`
      marker.appendChild(meta)

      return new maplibregl.Marker({
        anchor: 'center',
        element: marker,
      })
        .setLngLat(point)
        .addTo(map)
    })
  }, [correlatedSignalIds, focusSignalId, isMapReady, visibleSignals])

  const switchBasemap = (nextBasemap: Basemap) => {
    const map = mapRef.current
    if (!map) {
      return
    }

    map.setLayoutProperty(
      'imagery',
      'visibility',
      nextBasemap === 'imagery' ? 'visible' : 'none',
    )
    map.setLayoutProperty(
      'streets',
      'visibility',
      nextBasemap === 'streets' ? 'visible' : 'none',
    )
    setBasemap(nextBasemap)
  }

  return (
    <div className="aor-map" aria-label="AOR tactical map">
      <div className="aor-map__canvas" ref={containerRef} />
      <div className="aor-map__hud">
        <div>
          <span>{scenario.id} / {scenario.theater}</span>
          <strong>{scenario.shortName}</strong>
        </div>
        <p>{cursorGrid}</p>
        <em className={`aor-map__posture aor-map__posture--${leadPriority}`}>
          {leadSignal
            ? `${priorityLabel(leadPriority)} / ${labelForSignal(leadSignal)}`
            : 'MONITOR / NO LOCAL SIGNALS'}
        </em>
      </div>
      <div className="aor-map__legend" aria-hidden="true">
        <span>
          <i className="aor-map__legend-key aor-map__legend-key--friendly" />
          Friendly
        </span>
        <span>
          <i className="aor-map__legend-key aor-map__legend-key--watch" />
          Watch
        </span>
        <span>
          <i className="aor-map__legend-key aor-map__legend-key--threat" />
          Threat
        </span>
      </div>
      <div className="aor-map__ops-strip" aria-hidden="true">
        <span>LIVE CONTACTS {visibleSignals.length}</span>
        <span>THREAT {highSignalCount}</span>
        <span>FUSED {correlatedSignalIds.length}</span>
        <span>{scenario.domains.length} DOMAINS</span>
        <span>{basemap.toUpperCase()}</span>
      </div>
      <div className="aor-map__basemaps" aria-label="AOR basemap">
        <button
          className={basemap === 'imagery' ? 'is-active' : ''}
          onClick={() => switchBasemap('imagery')}
          type="button"
        >
          Imagery
        </button>
        <button
          className={basemap === 'streets' ? 'is-active' : ''}
          onClick={() => switchBasemap('streets')}
          type="button"
        >
          Streets
        </button>
      </div>
      <div className="aor-map__scale">
        <span>Zoom {zoom}</span>
        <span>10m MGRS labels</span>
      </div>
    </div>
  )
}
