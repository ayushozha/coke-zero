import { useEffect, useRef, useState } from 'react'
import {
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
  PolylineGlowMaterialProperty,
  Rectangle,
  TileMapServiceImageryProvider,
  Viewer,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

const token = import.meta.env.VITE_CESIUM_ION_TOKEN?.trim()

const contacts = [
  {
    name: 'SAT-BRAVO',
    lon: 63.4,
    lat: 31.2,
    height: 650000,
    color: Color.RED,
  },
  {
    name: 'PNT DRIFT',
    lon: 70.5,
    lat: 38.1,
    height: 420000,
    color: Color.fromCssColorString('#ffb300'),
  },
  {
    name: 'RF BURST',
    lon: 51.9,
    lat: 34.8,
    height: 360000,
    color: Color.WHITE,
  },
]

const arcPositions = Cartesian3.fromDegreesArrayHeights([
  63.4, 31.2, 650000, 70.5, 38.1, 420000, 51.9, 34.8, 360000,
])

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
        multiplier: 45,
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
      point: {
        pixelSize: 12,
        color: { rgba: [255, 34, 34, 255] },
        outlineColor: { rgba: [0, 0, 0, 255] },
        outlineWidth: 2,
      },
      label: {
        text: 'SAT-BRAVO',
        font: '13px Share Tech Mono',
        fillColor: { rgba: [255, 255, 255, 255] },
        showBackground: true,
        backgroundColor: { rgba: [0, 0, 0, 185] },
        pixelOffset: { cartesian2: [0, -28] },
      },
      path: {
        leadTime: 160,
        trailTime: 420,
        width: 3,
        material: {
          solidColor: {
            color: { rgba: [255, 179, 0, 210] },
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
      point: {
        pixelSize: 10,
        color: { rgba: [255, 179, 0, 255] },
        outlineColor: { rgba: [0, 0, 0, 255] },
        outlineWidth: 2,
      },
      label: {
        text: 'PNT-CUSTODY',
        font: '13px Share Tech Mono',
        fillColor: { rgba: [255, 255, 255, 255] },
        showBackground: true,
        backgroundColor: { rgba: [0, 0, 0, 185] },
        pixelOffset: { cartesian2: [0, -28] },
      },
      path: {
        leadTime: 160,
        trailTime: 420,
        width: 2,
        material: {
          solidColor: {
            color: { rgba: [255, 255, 255, 155] },
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
        multiplier: 20,
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
      point: {
        pixelSize: 11,
        color: { rgba: [255, 179, 0, 255] },
        outlineColor: { rgba: [0, 0, 0, 255] },
        outlineWidth: 2,
      },
      label: {
        text: 'RELAY TEAM 2',
        font: '13px Share Tech Mono',
        fillColor: { rgba: [255, 255, 255, 255] },
        showBackground: true,
        backgroundColor: { rgba: [0, 0, 0, 185] },
        pixelOffset: { cartesian2: [0, -26] },
      },
      path: {
        leadTime: 60,
        trailTime: 360,
        width: 4,
        material: {
          solidColor: {
            color: { rgba: [255, 179, 0, 230] },
          },
        },
      },
    },
  ]
}

type CesiumGlobeProps = {
  onOpenAor?: () => void
}

export function CesiumGlobe({ onOpenAor }: CesiumGlobeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const creditRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const [activeLayer, setActiveLayer] = useState('baseline')
  const [imageryMode, setImageryMode] = useState(
    token ? 'Ion world imagery' : 'Local fallback imagery',
  )

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
      skyAtmosphere: false,
      skyBox: false,
      timeline: false,
      creditContainer: creditRef.current,
    })
    viewerRef.current = viewer

    viewer.scene.backgroundColor = Color.BLACK
    viewer.scene.globe.baseColor = Color.fromCssColorString('#080808')
    viewer.scene.globe.enableLighting = false
    viewer.scene.globe.showGroundAtmosphere = false
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 1400000
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
        addLocalImagery()
      })

      ionLayer.readyEvent.addEventListener(() => {
        if (!isDisposed) {
          setImageryMode('Ion world imagery')
        }
      })

      viewer.imageryLayers.add(ionLayer)
    } else {
      addLocalImagery()
    }

    viewer.entities.add({
      name: 'North Axis AOR',
      rectangle: {
        coordinates: Rectangle.fromDegrees(47, 25, 77, 43),
        fill: true,
        material: Color.RED.withAlpha(0.08),
        outline: true,
        outlineColor: Color.RED.withAlpha(0.75),
      },
    })

    contacts.forEach((contact) => {
      viewer.entities.add({
        name: contact.name,
        position: Cartesian3.fromDegrees(contact.lon, contact.lat, contact.height),
        point: {
          color: contact.color,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          pixelSize: 10,
          scaleByDistance: new NearFarScalar(1500000, 1.5, 25000000, 0.75),
        },
        label: {
          backgroundColor: Color.BLACK.withAlpha(0.72),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          fillColor: Color.WHITE,
          font: '13px Share Tech Mono',
          pixelOffset: new Cartesian2(0, -22),
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
        material: new PolylineGlowMaterialProperty({
          color: Color.fromCssColorString('#ffb300').withAlpha(0.8),
          glowPower: 0.16,
        }),
        positions: arcPositions,
        width: 3,
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

  const resetDynamicSources = () => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) {
      return
    }

    viewer.dataSources.removeAll()
    viewer.clock.shouldAnimate = true
    setActiveLayer('baseline')
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
          duration: 0.7,
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
      viewer.scene.camera.setView({
        destination: Cartesian3.fromDegrees(-116.52, 35.02, 95000),
        orientation: {
          heading: 6,
        },
      })
      setActiveLayer('vehicle')
      onOpenAor?.()
    })
  }

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
          className={activeLayer === 'vehicle' ? 'is-active' : ''}
          onClick={loadVehicle}
          type="button"
        >
          Vehicle
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
