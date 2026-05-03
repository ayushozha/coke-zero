import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { forward as toMgrs } from 'mgrs'
import 'maplibre-gl/dist/maplibre-gl.css'

type Basemap = 'imagery' | 'streets'

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

export function AorMap() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [basemap, setBasemap] = useState<Basemap>('streets')
  const [cursorGrid, setCursorGrid] = useState(formatMgrs(aorCenter))
  const [zoom, setZoom] = useState('15.2')

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

    const contactMarkers: maplibregl.Marker[] = []

    map.on('load', () => {
      map.addSource('aor-zone', {
        type: 'geojson',
        data: createAorPolygon(),
      })
      map.addLayer({
        id: 'aor-zone-fill',
        type: 'fill',
        source: 'aor-zone',
        paint: {
          'fill-color': '#ff2222',
          'fill-opacity': 0.08,
        },
      })
      map.addLayer({
        id: 'aor-zone-line',
        type: 'line',
        source: 'aor-zone',
        paint: {
          'line-color': '#ff2222',
          'line-opacity': 0.88,
          'line-width': 2,
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
          'line-color': '#ffb300',
          'line-opacity': 0.95,
          'line-width': 4,
        },
      })

      aorContacts.forEach((contact) => {
        const marker = document.createElement('div')
        marker.className = `aor-marker aor-marker--${contact.type}`
        marker.title = `${contact.label} / ${formatMgrs(contact.coordinate)}`

        const dot = document.createElement('span')
        dot.className = 'aor-marker__dot'
        marker.appendChild(dot)

        const label = document.createElement('span')
        label.className = 'aor-marker__label'
        label.textContent = contact.label
        marker.appendChild(label)

        const grid = document.createElement('span')
        grid.className = 'aor-marker__grid'
        grid.textContent = formatMgrs(contact.coordinate)
        marker.appendChild(grid)

        contactMarkers.push(
          new maplibregl.Marker({
            anchor: 'bottom',
            element: marker,
          })
            .setLngLat(contact.coordinate)
            .addTo(map),
        )
      })
    })

    map.on('mousemove', (event) => {
      setCursorGrid(formatMgrs([event.lngLat.lng, event.lngLat.lat]))
    })

    map.on('zoom', () => {
      setZoom(map.getZoom().toFixed(1))
    })

    return () => {
      contactMarkers.forEach((marker) => marker.remove())
      map.remove()
      mapRef.current = null
    }
  }, [])

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
