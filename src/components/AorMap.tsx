import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { forward as toMgrs } from 'mgrs'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { ScenarioDefinition } from '../data/scenarioLibrary'
import { commanderSignalSummary, domainLabel } from '../lib/commanderLanguage'
import { boundsForSignals, signalCoordinate } from '../lib/signalLocation'
import type { PlaybackStatus } from '../types/playback'
import type { Signal } from '../types/canopy'

type Basemap = 'imagery' | 'muted'
type AorMapProps = {
  correlatedSignalIds: string[]
  focusSignalId: string | null
  focusRequestId?: number
  playback: PlaybackStatus | null
  scenario: ScenarioDefinition
  signals: Signal[]
}

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

// Friendly / asset / threat contacts pinned in the AOR overlay. Used to
// build the `aor-contacts` MapLibre source layer below — the satellite
// view merge dropped this constant; restored here so the source layer
// has data to render.
const aorContacts: Array<{
  id: string
  label: string
  type: 'friendly' | 'asset' | 'threat'
  coordinate: [number, number]
}> = [
  {
    id: 'relay-team-2',
    label: 'RELAY TEAM 2',
    type: 'friendly',
    coordinate: [-116.52, 35.02],
  },
  {
    id: 'blos-relay-west',
    label: 'BLOS RELAY WEST',
    type: 'asset',
    coordinate: [-116.547, 35.039],
  },
  {
    id: 'rf-hit-11',
    label: 'RF HIT 11',
    type: 'threat',
    coordinate: [-116.485, 35.012],
  },
]

const labelForSignal = (signal: Signal) =>
  commanderSignalSummary(signal).location

const priorityForSignal = (signal: Signal) => {
  if (signal.confidence >= 0.86) {
    return 'high'
  }
  if (signal.confidence >= 0.74) {
    return 'watch'
  }
  return 'low'
}

const signalTimeMs = (signal: Signal | undefined) => {
  const time = Date.parse(signal?.ts ?? '')
  return Number.isFinite(time) ? time : null
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
    features:
      points.length > 1
        ? [
            {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: points,
              },
            },
          ]
        : [],
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
  focusRequestId = 0,
  scenario,
  signals,
}: AorMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const handledFocusRequestRef = useRef(0)
  const [isMapReady, setIsMapReady] = useState(false)
  const [basemap, setBasemap] = useState<Basemap>('imagery')
  const [zoomLevel, setZoomLevel] = useState(15.2)

  const coordinateSignals = useMemo(
    () =>
      signals
        .map((signal) => ({ point: signalCoordinate(signal), signal }))
        .filter(
          (entry): entry is { point: [number, number]; signal: Signal } =>
            entry.point !== null,
        ),
    [signals],
  )
  const scenarioBounds = useMemo(
    () => boundsForSignals(scenario.signals, aorBounds),
    [scenario.signals],
  )
  const scenarioRoute = useMemo(
    () =>
      scenario.signals
        .map(signalCoordinate)
        .filter((point): point is [number, number] => point !== null),
    [scenario.signals],
  )
  const contactDisplayLimit = zoomLevel >= 12.2 ? 8 : zoomLevel >= 10.4 ? 4 : 2
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
            (signalTimeMs(b.signal) ?? 0) - (signalTimeMs(a.signal) ?? 0) ||
            b.signal.confidence - a.signal.confidence
          )
        })
        .slice(0, contactDisplayLimit),
    [contactDisplayLimit, coordinateSignals, correlatedSignalIds, focusSignalId],
  )
  const mapDensity =
    zoomLevel >= 12.2 ? 'detail' : zoomLevel >= 10.4 ? 'contact' : 'wide'

  const signalFeatures = useMemo(
    () =>
      ({
        type: 'FeatureCollection',
        features: visibleSignals.map(({ point, signal }) => ({
          type: 'Feature',
          properties: {
            id: signal.id,
            label: labelForSignal(signal),
            meta: `${domainLabel(signal.domain)} ${Math.round(
              signal.confidence * 100,
            )}%`,
            priority: priorityForSignal(signal),
            focus: signal.id === focusSignalId,
            correlated: correlatedSignalIds.includes(signal.id),
          },
          geometry: {
            type: 'Point',
            coordinates: point,
          },
        })),
      }) as GeoJSON.FeatureCollection,
    [correlatedSignalIds, focusSignalId, visibleSignals],
  )

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    const map = new maplibregl.Map({
      attributionControl: false,
      center: centerFromBounds(scenarioBounds),
      container: containerRef.current,
      maxZoom: 19,
      minZoom: 5,
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
        },
        layers: [
          {
            id: 'imagery',
            type: 'raster',
            source: 'esriWorldImagery',
            paint: {
              'raster-brightness-max': 0.64,
              'raster-brightness-min': 0.03,
              'raster-contrast': 0.2,
              'raster-fade-duration': 0,
              'raster-saturation': -0.22,
            },
          },
          {
            id: 'muted',
            type: 'raster',
            source: 'esriWorldImagery',
            layout: {
              visibility: 'none',
            },
            paint: {
              'raster-brightness-max': 0.46,
              'raster-brightness-min': 0.02,
              'raster-contrast': 0.26,
              'raster-fade-duration': 0,
              'raster-saturation': -0.92,
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
        data: createAorPolygon(scenarioBounds),
      })
      map.addLayer({
        id: 'aor-zone-fill',
        type: 'fill',
        source: 'aor-zone',
        paint: {
          'fill-color': '#c9a457',
          'fill-opacity': 0.012,
        },
      })
      map.addLayer({
        id: 'aor-zone-line',
        type: 'line',
        source: 'aor-zone',
        paint: {
          'line-color': '#c9a457',
          'line-opacity': 0.34,
          'line-width': 0.9,
        },
      })

      map.addSource('mgrs-grid', {
        type: 'geojson',
        data: createGrid(scenarioBounds),
      })
      map.addLayer({
        id: 'mgrs-grid-line',
        type: 'line',
        source: 'mgrs-grid',
        paint: {
          'line-color': '#f5f7f0',
          'line-opacity': 0.07,
          'line-width': 0.7,
        },
      })

      map.addSource('relay-route', {
        type: 'geojson',
        data: createRoute(scenarioRoute),
      })
      map.addLayer({
        id: 'relay-route-line',
        type: 'line',
        source: 'relay-route',
        paint: {
          'line-color': '#c9a457',
          'line-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5,
            0.18,
            10,
            0.42,
            13,
            0.78,
          ],
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.1, 13, 2.2],
          'line-dasharray': [1.8, 1.2],
        },
      })

      map.addSource('aor-contacts', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: aorContacts.map((contact) => ({
            type: 'Feature',
            properties: {
              label: contact.label,
              grid: formatMgrs(contact.coordinate),
              type: contact.type,
            },
            geometry: {
              type: 'Point',
              coordinates: contact.coordinate,
            },
          })),
        } as GeoJSON.FeatureCollection,
      })
      map.addLayer({
        id: 'aor-contact-dot',
        type: 'circle',
        source: 'aor-contacts',
        paint: {
          'circle-color': [
            'match',
            ['get', 'type'],
            'friendly',
            '#c9a457',
            'asset',
            '#f5f7f0',
            'threat',
            '#e05c4f',
            '#33f2f0',
          ],
          'circle-opacity': 0.88,
          'circle-radius': 6,
          'circle-stroke-color': '#020404',
          'circle-stroke-width': 2,
        },
      })
      map.addLayer({
        id: 'aor-contact-label',
        type: 'symbol',
        source: 'aor-contacts',
        layout: {
          'text-field': ['concat', ['get', 'label'], '\n', ['get', 'grid']],
          'text-font': ['Open Sans Semibold'],
          'text-offset': [0, -1.6],
          'text-size': 11,
        },
        paint: {
          'text-color': '#f5f7f0',
          'text-halo-color': '#091112',
          'text-halo-width': 1.5,
        },
      })

      map.addSource('aor-signals', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'aor-signal-dot',
        type: 'circle',
        source: 'aor-signals',
        paint: {
          'circle-color': [
            'match',
            ['get', 'priority'],
            'high',
            '#e05c4f',
            'watch',
            '#c9a457',
            '#33f2f0',
          ],
          'circle-opacity': 0.9,
          'circle-radius': ['case', ['get', 'focus'], 8, ['get', 'correlated'], 7, 5],
          'circle-stroke-color': '#020404',
          'circle-stroke-width': 2,
        },
      })
      map.addLayer({
        id: 'aor-signal-label',
        type: 'symbol',
        source: 'aor-signals',
        layout: {
          'text-field': ['concat', ['get', 'label'], '\n', ['get', 'meta']],
          'text-font': ['Open Sans Semibold'],
          'text-offset': [1.4, 0],
          'text-size': 11,
          'text-anchor': 'left',
        },
        paint: {
          'text-color': '#f5f7f0',
          'text-halo-color': '#091112',
          'text-halo-width': 1.5,
        },
      })
    })

    map.on('zoom', () => {
      setZoomLevel(map.getZoom())
    })

    return () => {
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

    const source = map.getSource('aor-signals') as
      | maplibregl.GeoJSONSource
      | undefined
    if (source) {
      source.setData(signalFeatures)
    }
  }, [isMapReady, signalFeatures])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isMapReady) {
      return
    }

    const zoneSource = map.getSource('aor-zone') as
      | maplibregl.GeoJSONSource
      | undefined
    const gridSource = map.getSource('mgrs-grid') as
      | maplibregl.GeoJSONSource
      | undefined
    const routeSource = map.getSource('relay-route') as
      | maplibregl.GeoJSONSource
      | undefined

    zoneSource?.setData(createAorPolygon(scenarioBounds))
    gridSource?.setData(createGrid(scenarioBounds))
    routeSource?.setData(createRoute(scenarioRoute))
    const { width, height } = map.getContainer().getBoundingClientRect()
    const isWide = width >= 1080 && height >= 560
    map.fitBounds(
      [
        [scenarioBounds.west, scenarioBounds.south],
        [scenarioBounds.east, scenarioBounds.north],
      ],
      {
        animate: true,
        duration: 900,
        maxZoom: 12,
        padding: isWide
          ? { top: 96, right: 420, bottom: 260, left: 360 }
          : { top: 72, right: 48, bottom: 96, left: 48 },
      },
    )
  }, [isMapReady, scenario.id, scenarioBounds, scenarioRoute])

  useEffect(() => {
    const map = mapRef.current
    const focusSignal = signals.find((signal) => signal.id === focusSignalId)
    const focusPoint = focusSignal ? signalCoordinate(focusSignal) : null
    if (
      !map ||
      !isMapReady ||
      !focusPoint ||
      focusRequestId === 0 ||
      handledFocusRequestRef.current === focusRequestId
    ) {
      return
    }

    handledFocusRequestRef.current = focusRequestId
    map.flyTo({
      center: focusPoint,
      duration: 650,
      essential: true,
      zoom: Math.max(map.getZoom(), 11.5),
    })
  }, [focusRequestId, focusSignalId, isMapReady, signals])

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
      'muted',
      'visibility',
      nextBasemap === 'muted' ? 'visible' : 'none',
    )
    setBasemap(nextBasemap)
  }

  return (
    <div className={`aor-map aor-map--${mapDensity}`} aria-label="AOR tactical map">
      <div className="aor-map__canvas" ref={containerRef} />
      <div className="aor-map__basemaps" aria-label="AOR basemap">
        <button
          className={basemap === 'imagery' ? 'is-active' : ''}
          onClick={() => switchBasemap('imagery')}
          type="button"
        >
          Imagery
        </button>
        <button
          className={basemap === 'muted' ? 'is-active' : ''}
          onClick={() => switchBasemap('muted')}
          type="button"
        >
          Muted
        </button>
      </div>
    </div>
  )
}
