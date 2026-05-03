import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { forward as toMgrs, toPoint as mgrsToPoint } from 'mgrs'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Signal } from '../types/canopy'

type Basemap = 'imagery' | 'streets'
type AorMapProps = {
  correlatedSignalIds: string[]
  focusSignalId: string | null
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

const aorContacts = [
  {
    id: 'relay-team-2',
    label: 'RELAY TEAM 2',
    type: 'friendly',
    coordinate: [-116.52, 35.02] as [number, number],
  },
  {
    id: 'blos-relay-west',
    label: 'BLOS RELAY WEST',
    type: 'asset',
    coordinate: [-116.547, 35.039] as [number, number],
  },
  {
    id: 'rf-hit-11',
    label: 'RF HIT 11',
    type: 'threat',
    coordinate: [-116.485, 35.012] as [number, number],
  },
]

const formatMgrs = ([lon, lat]: [number, number]) =>
  toMgrs([lon, lat], 4).replace(
    /^(\d{1,2}[A-Z])([A-Z]{2})(\d{4})(\d{4})$/,
    '$1 $2 $3 $4',
  )

const signalPoint = (signal: Signal): [number, number] | null => {
  if (
    typeof signal.location.lng === 'number' &&
    typeof signal.location.lat === 'number'
  ) {
    return [signal.location.lng, signal.location.lat]
  }

  if (!signal.location.mgrs) {
    return null
  }

  try {
    const [lon, lat] = mgrsToPoint(signal.location.mgrs)
    return [lon, lat]
  } catch {
    return null
  }
}

const isInsideAor = ([lon, lat]: [number, number]) =>
  lon >= aorBounds.west &&
  lon <= aorBounds.east &&
  lat >= aorBounds.south &&
  lat <= aorBounds.north

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

const createAorPolygon = () =>
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
              [aorBounds.west, aorBounds.south],
              [aorBounds.east, aorBounds.south],
              [aorBounds.east, aorBounds.north],
              [aorBounds.west, aorBounds.north],
              [aorBounds.west, aorBounds.south],
            ],
          ],
        },
      },
    ],
  }) as GeoJSON.FeatureCollection

const createRoute = () =>
  ({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: relayRoute,
        },
      },
    ],
  }) as GeoJSON.FeatureCollection

const createGrid = () => {
  const features: GeoJSON.Feature[] = []
  const step = 0.01

  for (
    let lon = Math.ceil(aorBounds.west / step) * step;
    lon <= aorBounds.east;
    lon += step
  ) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [Number(lon.toFixed(5)), aorBounds.south],
          [Number(lon.toFixed(5)), aorBounds.north],
        ],
      },
    })
  }

  for (
    let lat = Math.ceil(aorBounds.south / step) * step;
    lat <= aorBounds.north;
    lat += step
  ) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [aorBounds.west, Number(lat.toFixed(5))],
          [aorBounds.east, Number(lat.toFixed(5))],
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
  signals,
}: AorMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [isMapReady, setIsMapReady] = useState(false)
  const [basemap, setBasemap] = useState<Basemap>('streets')
  const [cursorGrid, setCursorGrid] = useState(formatMgrs(aorCenter))
  const [zoom, setZoom] = useState('15.2')

  const visibleSignals = useMemo(
    () =>
      signals
        .map((signal) => ({ point: signalPoint(signal), signal }))
        .filter(
          (entry): entry is { point: [number, number]; signal: Signal } =>
            entry.point !== null && isInsideAor(entry.point),
        )
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
        .slice(0, 5),
    [correlatedSignalIds, focusSignalId, signals],
  )

  const signalFeatures = useMemo(
    () =>
      ({
        type: 'FeatureCollection',
        features: visibleSignals.map(({ point, signal }) => ({
          type: 'Feature',
          properties: {
            id: signal.id,
            label: labelForSignal(signal),
            meta: `${signal.domain.toUpperCase()} ${Math.round(
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
      center: aorCenter,
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
              'raster-brightness-max': 0.78,
              'raster-brightness-min': 0.03,
              'raster-contrast': 0.16,
              'raster-fade-duration': 0,
              'raster-saturation': -0.18,
            },
          },
          {
            id: 'streets',
            type: 'raster',
            source: 'osmStreets',
            paint: {
              'raster-brightness-max': 0.7,
              'raster-brightness-min': 0.02,
              'raster-contrast': 0.14,
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
        data: createAorPolygon(),
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
        data: createGrid(),
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
        data: createRoute(),
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

    map.on('mousemove', (event) => {
      setCursorGrid(formatMgrs([event.lngLat.lng, event.lngLat.lat]))
    })

    map.on('zoom', () => {
      setZoom(map.getZoom().toFixed(1))
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
        <span>AOR Mode</span>
        <strong>Relay Team 2</strong>
        <p>{cursorGrid}</p>
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
        <span>FUSED {correlatedSignalIds.length}</span>
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
