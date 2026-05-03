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
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  TileMapServiceImageryProvider,
  Viewer,
} from 'cesium'
import { forward as toMgrs, toPoint as mgrsToPoint } from 'mgrs'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import {
  addN2YOSatellite,
  clearN2YOSatelliteLayers,
  deselectN2YOSatellite,
  fetchN2YOPositionCache,
  isN2YOGeostationaryFamily,
  latestN2YOAltitudeKm,
  N2YO_SATELLITES,
  selectN2YOSatellite,
  setN2YOSatelliteLayerVisible,
  setN2YOOrbitsVisible,
  type N2YOLayerState,
  type N2YOSatelliteFamily,
} from '../lib/n2yoSatelliteLayer'
import type { Signal } from '../types/canopy'

const token = import.meta.env.VITE_CESIUM_ION_TOKEN?.trim()
const MAP_FONT =
  '12px "Aptos Display", Aptos, "IBM Plex Sans Condensed", "IBM Plex Sans", "SF Pro Text", ui-sans-serif, system-ui, sans-serif'
const MAP_RED = Color.fromCssColorString('#e05c4f')
const MAP_AMBER = Color.fromCssColorString('#c9a457')
const MAP_CYAN = Color.fromCssColorString('#33f2f0')
const MAP_PANEL = Color.fromCssColorString('#091112')
const RESET_CAMERA_DESTINATION = Cartesian3.fromDegrees(0, 0, 22_000_000)

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

type SatelliteFamilyFilter = 'all' | N2YOSatelliteFamily

const SATELLITE_FAMILY_FILTERS: SatelliteFamilyFilter[] = [
  'all',
  'AEHF',
  'MUOS',
  'WGS',
  'SBIRS',
  'GSSAP',
  'GPS-3',
]

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

const addMinutes = (date: Date, minutes: number) =>
  new Date(date.getTime() + minutes * 60000).toISOString()

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
  const n2yoLayersRef = useRef<N2YOLayerState[]>([])
  const selectedN2yoLayerRef = useRef<N2YOLayerState | null>(null)
  const [activeLayer, setActiveLayer] = useState('baseline')
  const [imageryMode, setImageryMode] = useState('Loading imagery')
  const [realSatelliteStatus, setRealSatelliteStatus] = useState('Satellites')
  const [satelliteFamilyFilter, setSatelliteFamilyFilter] =
    useState<SatelliteFamilyFilter>('all')
  const [selectedSatellite, setSelectedSatellite] = useState<N2YOLayerState | null>(null)
  const [showAllOrbits, setShowAllOrbits] = useState(false)
  const showAllOrbitsRef = useRef(false)
  const satelliteFamilyFilterRef = useRef<SatelliteFamilyFilter>('all')

  useEffect(() => {
    showAllOrbitsRef.current = showAllOrbits
  }, [showAllOrbits])

  useEffect(() => {
    satelliteFamilyFilterRef.current = satelliteFamilyFilter
  }, [satelliteFamilyFilter])

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

    const flyToCenteredEarth = (duration = 0.45) => {
      viewer.camera.flyTo({
        destination: RESET_CAMERA_DESTINATION,
        duration,
      })
    }

    const clickHandler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    clickHandler.setInputAction((event: ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(event.position)
      const pickedId = typeof picked?.id?.id === 'string' ? picked.id.id : null
      if (!pickedId?.startsWith('n2yo-') || !pickedId.endsWith('-satellite')) {
        if (selectedN2yoLayerRef.current) {
          deselectN2YOSatellite(viewer, selectedN2yoLayerRef.current)
          setN2YOOrbitsVisible(viewer, n2yoLayersRef.current, false)
          showAllOrbitsRef.current = false
          setShowAllOrbits(false)
          selectedN2yoLayerRef.current = null
          setSelectedSatellite(null)
          flyToCenteredEarth()
          viewer.scene.requestRender()
        }
        return
      }

      const layer = n2yoLayersRef.current.find((candidate) =>
        candidate.entityIds.includes(pickedId),
      )
      if (!layer) {
        return
      }

      if (showAllOrbitsRef.current) {
        setN2YOOrbitsVisible(viewer, n2yoLayersRef.current, false)
        showAllOrbitsRef.current = false
        setShowAllOrbits(false)
      }

      if (selectedN2yoLayerRef.current) {
        deselectN2YOSatellite(viewer, selectedN2yoLayerRef.current)
      }
      selectedN2yoLayerRef.current = layer
      selectN2YOSatellite(viewer, layer)
      setSelectedSatellite(layer)
      viewer.scene.requestRender()
    }, ScreenSpaceEventType.LEFT_CLICK)

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
          height: 20,
          image: markerSvg('drone', markerColorHex(contact.color)),
          scaleByDistance: new NearFarScalar(50000, 0.82, 900000, 0.42),
          width: 20,
        },
        label: {
          backgroundColor: MAP_PANEL.withAlpha(0.82),
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

    viewer.camera.setView({
      destination: RESET_CAMERA_DESTINATION,
    })

    return () => {
      isDisposed = true
      clickHandler.destroy()
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
            height: isFocus ? 24 : isCorrelated ? 21 : 18,
            image: markerSvg(markerKind, markerColorHex(color)),
            scaleByDistance: new NearFarScalar(1500000, 0.84, 25000000, 0.36),
            width: isFocus ? 24 : isCorrelated ? 21 : 18,
          },
          label: {
            backgroundColor: MAP_PANEL.withAlpha(0.84),
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

    viewer.scene.requestRender()
  }, [correlatedSignalIds, focusSignalId, signals])

  const resetDynamicSources = () => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) {
      return
    }

    viewer.dataSources.removeAll()
    if (selectedN2yoLayerRef.current) {
      deselectN2YOSatellite(viewer, selectedN2yoLayerRef.current)
    }
    clearN2YOSatelliteLayers(viewer, n2yoLayersRef.current)
    n2yoLayersRef.current = []
    selectedN2yoLayerRef.current = null
    setSelectedSatellite(null)
    satelliteFamilyFilterRef.current = 'all'
    setSatelliteFamilyFilter('all')
    showAllOrbitsRef.current = false
    setShowAllOrbits(false)
    viewer.clock.shouldAnimate = true
    setActiveLayer('baseline')
    viewer.camera.flyTo({
      destination: RESET_CAMERA_DESTINATION,
      duration: 0.6,
    })
  }

  const loadVehicle = () => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) {
      return
    }

    viewer.dataSources.removeAll()
    if (selectedN2yoLayerRef.current) {
      deselectN2YOSatellite(viewer, selectedN2yoLayerRef.current)
    }
    clearN2YOSatelliteLayers(viewer, n2yoLayersRef.current)
    n2yoLayersRef.current = []
    selectedN2yoLayerRef.current = null
    setSelectedSatellite(null)
    satelliteFamilyFilterRef.current = 'all'
    setSatelliteFamilyFilter('all')
    showAllOrbitsRef.current = false
    setShowAllOrbits(false)
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

  const visibleN2yoLayers = (
    familyFilter = satelliteFamilyFilterRef.current,
  ) =>
    n2yoLayersRef.current.filter(
      (layer) => familyFilter === 'all' || layer.satelliteFamily === familyFilter,
    )

  const visibleOrbitCapableLayers = (
    familyFilter = satelliteFamilyFilterRef.current,
  ) =>
    visibleN2yoLayers(familyFilter).filter(
      (layer) => !isN2YOGeostationaryFamily(layer.satelliteFamily),
    )

  const applySatelliteFamilyFilter = (familyFilter: SatelliteFamilyFilter) => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) {
      return
    }

    satelliteFamilyFilterRef.current = familyFilter
    setSatelliteFamilyFilter(familyFilter)

    if (
      selectedN2yoLayerRef.current &&
      familyFilter !== 'all' &&
      selectedN2yoLayerRef.current.satelliteFamily !== familyFilter
    ) {
      deselectN2YOSatellite(viewer, selectedN2yoLayerRef.current)
      selectedN2yoLayerRef.current = null
      setSelectedSatellite(null)
    }

    setN2YOOrbitsVisible(viewer, n2yoLayersRef.current, false)
    n2yoLayersRef.current.forEach((layer) => {
      setN2YOSatelliteLayerVisible(
        viewer,
        layer,
        familyFilter === 'all' || layer.satelliteFamily === familyFilter,
      )
    })

    const orbitCapableLayers = visibleOrbitCapableLayers(familyFilter)

    if (selectedN2yoLayerRef.current) {
      selectN2YOSatellite(viewer, selectedN2yoLayerRef.current)
    } else if (showAllOrbitsRef.current && orbitCapableLayers.length > 0) {
      setN2YOOrbitsVisible(viewer, orbitCapableLayers, true)
    } else if (showAllOrbitsRef.current) {
      showAllOrbitsRef.current = false
      setShowAllOrbits(false)
    }

    viewer.scene.requestRender()
  }

  const loadRealSatellites = () => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) {
      return
    }

    setRealSatelliteStatus('Loading sats')
    viewer.dataSources.removeAll()
    void Promise.all(
      N2YO_SATELLITES.map((satellite) =>
        fetchN2YOPositionCache(satellite).then((cache) => ({ cache, satellite })),
      ),
    )
      .then((payloads) => {
        if (viewer.isDestroyed()) {
          return
        }

        if (selectedN2yoLayerRef.current) {
          deselectN2YOSatellite(viewer, selectedN2yoLayerRef.current)
        }
        // Display each satellite at a fraction of its true altitude.
        // We're after *relative* spacing (LEO < MEO < GEO is what the
        // operator reads); true scale puts GEO at 36,000 km which
        // dominates the frame. Lower scale keeps the band ordering
        // intact while pulling the rings in tight enough for a readable
        // demo. 0.1 = 10% of true. Single knob — bump back up if rings
        // look too flat or too tight.
        const ALTITUDE_SCALE = 0.1
        clearN2YOSatelliteLayers(viewer, n2yoLayersRef.current)
        n2yoLayersRef.current = payloads.map(({ cache, satellite }) =>
          addN2YOSatellite(
            viewer,
            cache,
            satellite,
            latestN2YOAltitudeKm(cache) * 1000 * ALTITUDE_SCALE,
          ),
        )
        viewer.camera.flyTo({
          destination: RESET_CAMERA_DESTINATION,
          duration: 0.8,
        })
        selectedN2yoLayerRef.current = null
        setSelectedSatellite(null)
        satelliteFamilyFilterRef.current = 'all'
        setSatelliteFamilyFilter('all')
        showAllOrbitsRef.current = false
        setShowAllOrbits(false)
        viewer.clock.shouldAnimate = true
        setActiveLayer('real-satellite')
        setRealSatelliteStatus('Satellites')
        viewer.scene.requestRender()
      })
      .catch(() => {
        setRealSatelliteStatus('Sats unavailable')
      })
  }

  const toggleAllOrbits = () => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) {
      return
    }
    if (activeLayer !== 'real-satellite' || n2yoLayersRef.current.length === 0) {
      showAllOrbitsRef.current = false
      setShowAllOrbits(false)
      return
    }

    setShowAllOrbits((current) => {
      const next = !current
      if (next && selectedN2yoLayerRef.current) {
        deselectN2YOSatellite(viewer, selectedN2yoLayerRef.current)
        selectedN2yoLayerRef.current = null
        setSelectedSatellite(null)
      }
      setN2YOOrbitsVisible(viewer, visibleOrbitCapableLayers(), next)
      showAllOrbitsRef.current = next
      viewer.scene.requestRender()
      return next
    })
  }

  useEffect(() => {
    if (displayMode === 'globe') {
      resetDynamicSources()
      return
    }

    loadVehicle()
  }, [displayMode])

  return (
    <>
      <div className="cesium-globe" ref={containerRef} />
      <div className="cesium-scenario-controls" aria-label="Map layers">
        <button
          className={activeLayer === 'local-aor' ? 'is-active' : ''}
          onClick={loadVehicle}
          type="button"
        >
          Local AOR
        </button>
        <button
          className={activeLayer === 'real-satellite' ? 'is-active' : ''}
          onClick={loadRealSatellites}
          type="button"
        >
          {realSatelliteStatus}
        </button>
        <button onClick={resetDynamicSources} type="button">
          Reset
        </button>
      </div>
      {activeLayer === 'real-satellite' ? (
        <>
          <div className="satellite-family-controls" aria-label="Satellite families">
            {SATELLITE_FAMILY_FILTERS.map((familyFilter) => (
              <button
                className={
                  satelliteFamilyFilter === familyFilter ? 'is-active' : ''
                }
                disabled={n2yoLayersRef.current.length === 0}
                key={familyFilter}
                onClick={() => applySatelliteFamilyFilter(familyFilter)}
                type="button"
              >
                {familyFilter === 'all' ? 'All' : familyFilter}
              </button>
            ))}
          </div>
          <button
            aria-pressed={showAllOrbits}
            className={showAllOrbits ? 'orbit-toggle orbit-toggle--active' : 'orbit-toggle'}
            disabled={visibleOrbitCapableLayers().length === 0}
            onClick={toggleAllOrbits}
            type="button"
          >
            <span className="orbit-toggle__box" aria-hidden="true" />
            <span>Orbits</span>
          </button>
        </>
      ) : null}
      {selectedSatellite ? (
        <aside className="satellite-detail" aria-label="Selected satellite">
          <span>Selected Satellite</span>
          <strong>{selectedSatellite.satelliteName}</strong>
          <dl>
            <div>
              <dt>NORAD</dt>
              <dd>{selectedSatellite.satelliteId}</dd>
            </div>
            <div>
              <dt>True Alt</dt>
              <dd>{Math.round(selectedSatellite.point.alt_km).toLocaleString()} km</dd>
            </div>
            <div>
              <dt>Lat / Lon</dt>
              <dd>
                {selectedSatellite.point.lat.toFixed(2)} /{' '}
                {selectedSatellite.point.lng.toFixed(2)}
              </dd>
            </div>
            <div>
              <dt>Fix</dt>
              <dd>
                {new Date(selectedSatellite.point.timestamp_utc).toLocaleTimeString([], {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </dd>
            </div>
          </dl>
        </aside>
      ) : null}
      <div className="map-stage__mode">{imageryMode}</div>
      <div className="cesium-credits" ref={creditRef} />
    </>
  )
}
