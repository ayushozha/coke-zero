import { useEffect, useRef, useState } from 'react'
import {
  ArcGisMapServerImageryProvider,
  Cartesian2,
  Cartesian3,
  Color,
  createWorldImageryAsync,
  CzmlDataSource,
  Ion,
  ImageryLayer,
  IonWorldImageryStyle,
  LabelStyle,
  NearFarScalar,
  PolylineDashMaterialProperty,
  Rectangle,
  TileMapServiceImageryProvider,
  Viewer,
} from 'cesium'
import { forward as toMgrs, toPoint as mgrsToPoint } from 'mgrs'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import type { Signal } from '../types/canopy'

const token = import.meta.env.VITE_CESIUM_ION_TOKEN?.trim()
const MAP_FONT =
  '12px "Aptos Display", Aptos, "IBM Plex Sans Condensed", "IBM Plex Sans", "SF Pro Text", ui-sans-serif, system-ui, sans-serif'
const MAP_RED = Color.fromCssColorString('#e05c4f')
const MAP_AMBER = Color.fromCssColorString('#c9a457')
const MAP_CYAN = Color.fromCssColorString('#33f2f0')
const MAP_PANEL = Color.fromCssColorString('#091112')

const markerSvg = (
  kind: 'satellite' | 'drone' | 'signal',
  stroke: string,
  fill = 'rgba(2,4,4,0.72)',
) => {
  const inner =
    kind === 'satellite'
      ? '<path d="M13 13h10v10H13z"/><path d="M5 16h6M25 16h6M5 20h6M25 20h6M18 7v4M18 25v4"/><circle cx="18" cy="18" r="2.4" fill="currentColor" stroke="none"/>'
      : kind === 'drone'
        ? '<path d="M18 6l10 20-10-5-10 5z"/><path d="M18 11v10M13 20h10"/><circle cx="18" cy="18" r="2.2" fill="currentColor" stroke="none"/>'
        : '<path d="M18 7l11 11-11 11L7 18z"/><path d="M18 12v12M12 18h12"/><circle cx="18" cy="18" r="2.2" fill="currentColor" stroke="none"/>'

  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 36 36">
      <filter id="g" x="-60%" y="-60%" width="220%" height="220%">
        <feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="#000000" flood-opacity="0.72"/>
      </filter>
      <g color="${stroke}" fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" filter="url(#g)">
        ${inner}
      </g>
    </svg>`,
  )}`
}

const markerColorHex = (color: Color) => color.toCssHexString()

const markerKindForDomain = (domain?: Signal['domain']) => {
  if (domain === 'sda' || domain === 'orbit' || domain === 'satcom') {
    return 'satellite'
  }
  if (domain === 'drone' || domain === 'pnt' || domain === 'terrain') {
    return 'drone'
  }
  return 'signal'
}

type CesiumGlobeProps = {
  correlatedSignalIds?: string[]
  displayMode?: 'nav' | 'globe'
  focusSignalId?: string | null
  signals?: Signal[]
}

type MapPoint = {
  lon: number
  lat: number
  height: number
  label: string
}

const contacts = [
  {
    name: 'SAT-BRAVO',
    lon: 63.4,
    lat: 31.2,
    height: 650000,
    color: MAP_RED,
  },
  {
    name: 'PNT DRIFT',
    lon: 70.5,
    lat: 38.1,
    height: 420000,
    color: MAP_AMBER,
  },
  {
    name: 'RF BURST',
    lon: 51.9,
    lat: 34.8,
    height: 360000,
    color: MAP_CYAN,
  },
]

const arcPositions = Cartesian3.fromDegreesArrayHeights([
  63.4, 31.2, 650000, 70.5, 38.1, 420000, 51.9, 34.8, 360000,
])

const localAorBounds = {
  west: -116.61,
  south: 34.98,
  east: -116.43,
  north: 35.08,
}

const localRoute = [
  [-116.57, 35.0, 1200],
  [-116.55, 35.015, 1225],
  [-116.52, 35.02, 1210],
  [-116.49, 35.035, 1235],
  [-116.46, 35.05, 1240],
]

const localContacts = [
  {
    name: 'RELAY TEAM 2',
    lon: -116.52,
    lat: 35.02,
    height: 1210,
    color: MAP_AMBER,
  },
  {
    name: 'BLOS RELAY WEST',
    lon: -116.547,
    lat: 35.039,
    height: 1225,
    color: MAP_CYAN,
  },
  {
    name: 'RF HIT 11',
    lon: -116.485,
    lat: 35.012,
    height: 1230,
    color: MAP_RED,
  },
]

const formatMgrs = (lon: number, lat: number) =>
  toMgrs([lon, lat], 4).replace(
    /^(\d{1,2}[A-Z])([A-Z]{2})(\d{4})(\d{4})$/,
    '$1 $2 $3 $4',
  )

const colorForSignal = (signal: Signal) => {
  if (signal.confidence >= 0.86) {
    return MAP_RED
  }
  if (signal.confidence >= 0.74) {
    return MAP_AMBER
  }
  return MAP_CYAN
}

const signalLabel = (signal: Signal) =>
  signal.location.label ??
  signal.payload.asset ??
  signal.payload.event_type.replaceAll('_', ' ').toUpperCase()

const signalPoint = (signal: Signal): MapPoint | null => {
  let lon = signal.location.lng
  let lat = signal.location.lat

  if (
    (typeof lon !== 'number' || typeof lat !== 'number') &&
    signal.location.mgrs
  ) {
    try {
      const [mgrsLon, mgrsLat] = mgrsToPoint(signal.location.mgrs)
      lon = mgrsLon
      lat = mgrsLat
    } catch {
      return null
    }
  }

  if (typeof lon !== 'number' || typeof lat !== 'number') {
    return null
  }

  const height =
    signal.location.alt_m ??
    (signal.location.alt_km !== undefined
      ? signal.location.alt_km * 1000
      : signal.domain === 'orbit' || signal.domain === 'sda'
        ? 400000
        : 25)

  return {
    lon,
    lat,
    height,
    label: signalLabel(signal),
  }
}

const signalPolygon = (signal: Signal) => {
  const match = signal.location.area_wkt?.match(/POLYGON\s*\(\((.+)\)\)/i)
  if (!match) {
    return null
  }

  const coords = match[1]
    .split(',')
    .flatMap((pair) => {
      const [lon, lat] = pair.trim().split(/\s+/).map(Number)
      return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : []
    })

  return coords.length >= 6 ? coords : null
}

const cameraHeightForSignal = (signal: Signal, point: MapPoint) => {
  if (signal.domain === 'orbit' || signal.domain === 'sda') {
    return Math.max(point.height * 4, 2200000)
  }
  return 90000
}

const addMinutes = (date: Date, minutes: number) =>
  new Date(date.getTime() + minutes * 60000).toISOString()

const createSatelliteCzml = () => {
  const start = new Date()
  const stop = addMinutes(start, 12)
  const epoch = start.toISOString()
  const interval = `${epoch}/${stop}`

  return [
    {
      id: 'document',
      name: 'CANOPY Satellite Tracks',
      version: '1.0',
      clock: {
        interval,
        currentTime: epoch,
        multiplier: 8,
        range: 'LOOP_STOP',
        step: 'SYSTEM_CLOCK_MULTIPLIER',
      },
    },
    {
      id: 'Satellite/SAT-BRAVO',
      availability: interval,
      name: 'SAT-BRAVO',
      position: {
        epoch,
        interpolationAlgorithm: 'LAGRANGE',
        interpolationDegree: 2,
        cartographicDegrees: [
          0, 28, 18, 720000, 120, 45, 28, 760000, 240, 63.4, 31.2,
          650000, 360, 83, 37, 740000, 520, 104, 34, 720000,
        ],
      },
      billboard: {
        height: 20,
        image: markerSvg('satellite', '#e05c4f'),
        scale: 1,
        width: 20,
      },
      label: {
        text: 'SAT-BRAVO',
        font: MAP_FONT,
        fillColor: { rgba: [255, 255, 255, 255] },
        show: false,
        showBackground: true,
        backgroundColor: { rgba: [9, 17, 18, 220] },
        pixelOffset: { cartesian2: [0, -28] },
      },
      path: {
        leadTime: 0,
        trailTime: 900,
        width: 1.1,
        material: {
          solidColor: {
            color: { rgba: [201, 164, 87, 116] },
          },
        },
      },
    },
    {
      id: 'Satellite/PNT-CUSTODY',
      availability: interval,
      name: 'PNT-CUSTODY',
      position: {
        epoch,
        interpolationAlgorithm: 'LAGRANGE',
        interpolationDegree: 2,
        cartographicDegrees: [
          0, 96, 8, 540000, 120, 82, 23, 560000, 240, 70.5, 38.1,
          420000, 360, 49, 44, 510000, 520, 24, 36, 530000,
        ],
      },
      billboard: {
        height: 20,
        image: markerSvg('satellite', '#33f2f0'),
        scale: 1,
        width: 20,
      },
      label: {
        text: 'PNT-CUSTODY',
        font: MAP_FONT,
        fillColor: { rgba: [255, 255, 255, 255] },
        show: false,
        showBackground: true,
        backgroundColor: { rgba: [9, 17, 18, 220] },
        pixelOffset: { cartesian2: [0, -28] },
      },
      path: {
        leadTime: 0,
        trailTime: 900,
        width: 1,
        material: {
          solidColor: {
            color: { rgba: [245, 247, 240, 84] },
          },
        },
      },
    },
  ]
}

const createVehicleCzml = () => {
  const start = new Date()
  const stop = addMinutes(start, 8)
  const epoch = start.toISOString()
  const interval = `${epoch}/${stop}`

  return [
    {
      id: 'document',
      name: 'CANOPY Vehicle Track',
      version: '1.0',
      clock: {
        interval,
        currentTime: epoch,
        multiplier: 4,
        range: 'LOOP_STOP',
        step: 'SYSTEM_CLOCK_MULTIPLIER',
      },
    },
    {
      id: 'Vehicle/Relay-Team-2',
      availability: interval,
      name: 'Relay-Team-2',
      position: {
        epoch,
        interpolationAlgorithm: 'LINEAR',
        cartographicDegrees: [
          0, -116.57, 35.0, 1200, 90, -116.55, 35.015, 1225, 180,
          -116.52, 35.02, 1210, 270, -116.49, 35.035, 1235, 380,
          -116.46, 35.05, 1240,
        ],
      },
      billboard: {
        height: 20,
        image: markerSvg('drone', '#c9a457'),
        scale: 1,
        width: 20,
      },
      label: {
        text: 'RELAY TEAM 2',
        font: MAP_FONT,
        fillColor: { rgba: [255, 255, 255, 255] },
        show: false,
        showBackground: true,
        backgroundColor: { rgba: [9, 17, 18, 220] },
        pixelOffset: { cartesian2: [0, -26] },
      },
      path: {
        leadTime: 0,
        trailTime: 240,
        width: 1.6,
        material: {
          solidColor: {
            color: { rgba: [201, 164, 87, 128] },
          },
        },
      },
    },
  ]
}

export function CesiumGlobe({
  correlatedSignalIds = [],
  displayMode = 'nav',
  focusSignalId = null,
  signals = [],
}: CesiumGlobeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const creditRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const signalEntityIdsRef = useRef<Set<string>>(new Set())
  const focusFlightSignalIdRef = useRef<string | null>(null)
  const [activeLayer, setActiveLayer] = useState('baseline')
  const [imageryMode, setImageryMode] = useState('Loading imagery')

  useEffect(() => {
    if (!containerRef.current || !creditRef.current) {
      return
    }

    if (token) {
      Ion.defaultAccessToken = token
    }

    let isDisposed = false
    const viewer = new Viewer(containerRef.current, {
      animation: false,
      baseLayer: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      scene3DOnly: true,
      sceneModePicker: false,
      selectionIndicator: false,
      shouldAnimate: true,
      skyBox: false,
      timeline: false,
      useBrowserRecommendedResolution: false,
      creditContainer: creditRef.current,
    })
    viewerRef.current = viewer

    viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, 2)
    viewer.scene.backgroundColor = Color.fromCssColorString('#07100f')
    viewer.scene.globe.baseColor = Color.fromCssColorString('#0c1514')
    viewer.scene.globe.enableLighting = false
    viewer.scene.globe.maximumScreenSpaceError = 1
    viewer.scene.globe.showGroundAtmosphere = true
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 250
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 42000000

    const addLocalImagery = () => {
      void TileMapServiceImageryProvider.fromUrl(
        '/cesiumStatic/Assets/Textures/NaturalEarthII',
      ).then((provider) => {
        if (isDisposed || viewer.isDestroyed()) {
          return
        }

        const layer = new ImageryLayer(provider, {
          alpha: 0.95,
          brightness: 0.82,
          contrast: 1.18,
          gamma: 1.05,
          saturation: 0.12,
        })
        viewer.imageryLayers.add(layer)
        setImageryMode('Local fallback imagery')
        viewer.scene.requestRender()
      })
    }

    const addEsriImagery = () => {
      const esriLayer = ImageryLayer.fromProviderAsync(
        ArcGisMapServerImageryProvider.fromUrl(
          'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
          {
            enablePickFeatures: false,
          },
        ),
        {
          alpha: 0.95,
          brightness: 0.88,
          contrast: 1.04,
          gamma: 1,
          saturation: 0.02,
        },
      )

      esriLayer.errorEvent.addEventListener(() => {
        if (isDisposed || viewer.isDestroyed()) {
          return
        }

        viewer.imageryLayers.remove(esriLayer, true)
        addLocalImagery()
      })

      esriLayer.readyEvent.addEventListener(() => {
        if (!isDisposed) {
          setImageryMode('Esri world imagery')
        }
      })

      viewer.imageryLayers.add(esriLayer)
    }

    if (token) {
      Ion.defaultAccessToken = token
      const ionLayer = ImageryLayer.fromProviderAsync(
        createWorldImageryAsync({
          style: IonWorldImageryStyle.AERIAL,
        }),
        {
          alpha: 0.88,
          brightness: 0.72,
          contrast: 1.08,
          gamma: 1,
          saturation: 0.18,
        },
      )

      ionLayer.errorEvent.addEventListener(() => {
        if (isDisposed || viewer.isDestroyed()) {
          return
        }

        viewer.imageryLayers.remove(ionLayer, true)
        addEsriImagery()
      })

      ionLayer.readyEvent.addEventListener(() => {
        if (!isDisposed) {
          setImageryMode('Ion world imagery')
        }
      })

      viewer.imageryLayers.add(ionLayer)
    } else {
      addEsriImagery()
    }

    viewer.entities.add({
      name: 'North Axis AOR',
      rectangle: {
        coordinates: Rectangle.fromDegrees(47, 25, 77, 43),
        fill: true,
        height: 0,
        material: MAP_RED.withAlpha(0.08),
        outline: true,
        outlineColor: MAP_RED.withAlpha(0.65),
      },
    })

    viewer.entities.add({
      id: 'local-aor-boundary',
      name: 'Local AOR Boundary',
      rectangle: {
        coordinates: Rectangle.fromDegrees(
          localAorBounds.west,
          localAorBounds.south,
          localAorBounds.east,
          localAorBounds.north,
        ),
        fill: true,
        height: 0,
        material: MAP_RED.withAlpha(0.06),
        outline: true,
        outlineColor: MAP_RED.withAlpha(0.65),
      },
    })

    viewer.entities.add({
      id: 'local-aor-route',
      name: 'Relay Team 2 Route',
      polyline: {
        clampToGround: true,
        material: new PolylineDashMaterialProperty({
          color: MAP_AMBER.withAlpha(0.68),
          dashLength: 18,
        }),
        positions: Cartesian3.fromDegreesArrayHeights(localRoute.flat()),
        width: 2,
      },
    })

    localContacts.forEach((contact) => {
      viewer.entities.add({
        id: `local-${contact.name.toLowerCase().replaceAll(' ', '-')}`,
        name: contact.name,
        position: Cartesian3.fromDegrees(contact.lon, contact.lat, contact.height),
        billboard: {
          color: Color.WHITE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          height: 20,
          image: markerSvg('drone', markerColorHex(contact.color)),
          scaleByDistance: new NearFarScalar(50000, 0.82, 900000, 0.42),
          width: 20,
        },
        label: {
          backgroundColor: MAP_PANEL.withAlpha(0.82),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          fillColor: Color.WHITE,
          font: MAP_FONT,
          pixelOffset: new Cartesian2(0, -28),
          show: false,
          showBackground: true,
          style: LabelStyle.FILL,
          text: `${contact.name}\n${formatMgrs(contact.lon, contact.lat)}`,
        },
      })
    })

    contacts.forEach((contact) => {
      viewer.entities.add({
        name: contact.name,
        position: Cartesian3.fromDegrees(contact.lon, contact.lat, contact.height),
        billboard: {
          color: Color.WHITE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          height: 20,
          image: markerSvg('satellite', markerColorHex(contact.color)),
          scaleByDistance: new NearFarScalar(1500000, 0.86, 25000000, 0.38),
          width: 20,
        },
        label: {
          backgroundColor: MAP_PANEL.withAlpha(0.82),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          fillColor: Color.WHITE,
          font: MAP_FONT,
          pixelOffset: new Cartesian2(0, -22),
          show: false,
          showBackground: true,
          style: LabelStyle.FILL,
          text: contact.name,
        },
      })
    })

    viewer.entities.add({
      name: 'Cross-domain correlation',
      polyline: {
        clampToGround: false,
        material: new PolylineDashMaterialProperty({
          color: MAP_AMBER.withAlpha(0.46),
          dashLength: 28,
        }),
        positions: arcPositions,
        width: 1,
      },
    })

    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(58, 28, 18500000),
    })

    return () => {
      isDisposed = true
      viewerRef.current = null
      if (!viewer.isDestroyed()) {
        viewer.destroy()
      }
    }
  }, [])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) {
      return
    }

    signalEntityIdsRef.current.forEach((id) => {
      viewer.entities.removeById(id)
    })
    signalEntityIdsRef.current.clear()

    const correlatedIds = new Set(correlatedSignalIds)
    const signalPoints = signals
      .map((signal) => ({ signal, point: signalPoint(signal) }))
      .filter(
        (item): item is { signal: Signal; point: MapPoint } =>
          item.point !== null,
      )
    const focusSignalPoint =
      signalPoints.find((item) => item.signal.id === focusSignalId) ?? null
    signals.forEach((signal) => {
      const entityId = `signal-${signal.id}`
      const color = colorForSignal(signal)
      const point = signalPoint(signal)
      const polygon = signalPolygon(signal)
      const isFocus = signal.id === focusSignalId
      const isCorrelated = correlatedIds.has(signal.id)
      const shouldLabel = isFocus && signals.length <= 8
      const markerKind = markerKindForDomain(signal.domain)

      if (point) {
        viewer.entities.add({
          id: entityId,
          name: point.label,
          position: Cartesian3.fromDegrees(point.lon, point.lat, point.height),
          billboard: {
            color: Color.WHITE,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            height: isFocus ? 24 : isCorrelated ? 21 : 18,
            image: markerSvg(markerKind, markerColorHex(color)),
            scaleByDistance: new NearFarScalar(1500000, 0.84, 25000000, 0.36),
            width: isFocus ? 24 : isCorrelated ? 21 : 18,
          },
          label: {
            backgroundColor: MAP_PANEL.withAlpha(0.84),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            fillColor: Color.WHITE,
            font: MAP_FONT,
            pixelOffset: new Cartesian2(0, -28),
            scaleByDistance: new NearFarScalar(800000, 1, 22000000, 0.62),
            show: shouldLabel,
            showBackground: true,
            style: LabelStyle.FILL,
            text: 'FOCUS',
          },
          description: signal.payload.summary,
        })
        signalEntityIdsRef.current.add(entityId)

        if (isFocus || isCorrelated) {
          const pulseId = `${entityId}-pulse`
          viewer.entities.add({
            id: pulseId,
            name: `${point.label} focus ring`,
            position: Cartesian3.fromDegrees(point.lon, point.lat, 0),
            ellipse: {
              semiMajorAxis: isFocus ? 14000 : 9500,
              semiMinorAxis: isFocus ? 14000 : 9500,
              material: color.withAlpha(isFocus ? 0.03 : 0.018),
              outline: true,
              outlineColor: color.withAlpha(isFocus ? 0.42 : 0.26),
            },
          })
          signalEntityIdsRef.current.add(pulseId)
        }
      } else if (polygon) {
        viewer.entities.add({
          id: entityId,
          name: signalLabel(signal),
          polygon: {
            hierarchy: Cartesian3.fromDegreesArray(polygon),
            material: color.withAlpha(0.08),
            outline: true,
            outlineColor: color.withAlpha(0.8),
          },
          description: signal.payload.summary,
        })
        signalEntityIdsRef.current.add(entityId)
      }
    })

    const thread = signalPoints.slice(0, 6).flatMap(({ point }) => [
      point.lon,
      point.lat,
      Math.max(point.height, 400),
    ])
    if (thread.length >= 6) {
      const threadId = 'signal-thread'
      viewer.entities.add({
        id: threadId,
        name: 'Live signal thread',
        polyline: {
          clampToGround: false,
          material: new PolylineDashMaterialProperty({
            color: Color.WHITE.withAlpha(0.24),
            dashLength: 20,
          }),
          positions: Cartesian3.fromDegreesArrayHeights(thread),
          width: 1,
        },
      })
      signalEntityIdsRef.current.add(threadId)
    }

    const correlation = signalPoints
      .filter(({ signal }) => correlatedIds.has(signal.id))
      .flatMap(({ point }) => [point.lon, point.lat, Math.max(point.height, 400)])
    if (correlation.length >= 6) {
      const correlationId = 'signal-correlation'
      viewer.entities.add({
        id: correlationId,
        name: 'Fused signal correlation',
        polyline: {
          clampToGround: false,
          material: new PolylineDashMaterialProperty({
            color: MAP_AMBER.withAlpha(0.5),
            dashLength: 24,
          }),
          positions: Cartesian3.fromDegreesArrayHeights(correlation),
          width: 1.4,
        },
      })
      signalEntityIdsRef.current.add(correlationId)
    }

    if (
      focusSignalPoint &&
      focusSignalId &&
      focusFlightSignalIdRef.current !== focusSignalId
    ) {
      focusFlightSignalIdRef.current = focusSignalId
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(
          focusSignalPoint.point.lon,
          focusSignalPoint.point.lat,
          cameraHeightForSignal(focusSignalPoint.signal, focusSignalPoint.point),
        ),
        duration: 0.6,
      })
    }

    viewer.scene.requestRender()
  }, [correlatedSignalIds, focusSignalId, signals])

  const resetDynamicSources = () => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) {
      return
    }

    viewer.dataSources.removeAll()
    viewer.clock.shouldAnimate = true
    setActiveLayer('baseline')
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(58, 28, 18500000),
      duration: 0.6,
    })
  }

  const loadSatellites = () => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) {
      return
    }

    viewer.dataSources.removeAll()
    void viewer.dataSources
      .add(CzmlDataSource.load(createSatelliteCzml()))
      .then(() => {
        if (viewer.isDestroyed()) {
          return
        }

        viewer.clock.shouldAnimate = true
        viewer.camera.flyTo({
          destination: Cartesian3.fromDegrees(58, 28, 18500000),
          duration: 0.6,
        })
        setActiveLayer('satellites')
      })
  }

  const loadVehicle = () => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) {
      return
    }

    viewer.dataSources.removeAll()
    void viewer.dataSources.add(CzmlDataSource.load(createVehicleCzml())).then(() => {
      if (viewer.isDestroyed()) {
        return
      }

      viewer.clock.shouldAnimate = true
      setActiveLayer('local-aor')
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(-116.52, 35.02, 22000),
        duration: 0.8,
        orientation: {
          heading: 6,
          pitch: -1.08,
          roll: 0,
        },
      })
    })
  }

  useEffect(() => {
    if (displayMode === 'globe') {
      loadSatellites()
      return
    }

    loadVehicle()
  }, [displayMode])

  return (
    <>
      <div className="cesium-globe" ref={containerRef} />
      <div className="cesium-scenario-controls" aria-label="Map layers">
        <button
          className={activeLayer === 'satellites' ? 'is-active' : ''}
          onClick={loadSatellites}
          type="button"
        >
          Satellites
        </button>
        <button
          className={activeLayer === 'local-aor' ? 'is-active' : ''}
          onClick={loadVehicle}
          type="button"
        >
          Local AOR
        </button>
        <button onClick={resetDynamicSources} type="button">
          Reset
        </button>
      </div>
      <div className="map-stage__mode">{imageryMode}</div>
      <div className="cesium-credits" ref={creditRef} />
    </>
  )
}
