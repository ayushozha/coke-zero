import { useEffect, useMemo, useRef } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

import { useEventStore } from "../store/eventStore";
import type { RequestPacket, Signal } from "../types/coke_zero";

const ORBIT_ALT_KM = 550;
const KM_PER_DEG_LAT = 111.32;

function findDecisionId(eventId: string): string | null {
  const m = eventId.match(/^uievt-(.+)$/);
  return m ? m[1] : null;
}

function pickClosestApproachLocation(
  signalIds: string[],
  signalsById: Record<string, Signal>,
): { lat: number; lng: number } {
  // Use the first signal in the chain that has lat/lng — typically the
  // RPO orbital signal. Fall back to a Western Pacific default.
  for (const sid of signalIds) {
    const sig = signalsById[sid];
    if (
      sig &&
      typeof sig.location.lat === "number" &&
      typeof sig.location.lng === "number"
    ) {
      return { lat: sig.location.lat, lng: sig.location.lng };
    }
  }
  return { lat: 14, lng: 134 };
}

/**
 * Generates a short polyline at orbital altitude through `(lat, lng)` heading
 * roughly east, offset perpendicular by `offsetKm`. Cesium polylines need
 * a flat array of [lng, lat, height_meters, ...].
 */
function makeTrack(
  lat: number,
  lng: number,
  offsetKm: number,
  spanDeg = 12,
): number[] {
  const offsetDeg = offsetKm / KM_PER_DEG_LAT;
  const altMeters = ORBIT_ALT_KM * 1000;
  const points: number[] = [];
  for (let i = 0; i <= 32; i++) {
    const t = (i / 32) * spanDeg - spanDeg / 2; // -span/2 .. +span/2 deg longitude
    points.push(lng + t, lat + offsetDeg, altMeters);
  }
  return points;
}

export function OrbitalTakeover() {
  const event = useEventStore((s) => s.takeoverEvent);
  const decisionsById = useEventStore((s) => s.decisionsById);
  const signalsById = useEventStore((s) => s.signalsById);
  const close = useEventStore((s) => s.closeTakeover);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);

  const packet: RequestPacket | null = useMemo(() => {
    if (!event) return null;
    const decisionId = findDecisionId(event.id);
    const decision = decisionId ? decisionsById[decisionId] : null;
    return decision?.request_packet ?? null;
  }, [event, decisionsById]);

  const preMiss = packet?.pre_miss_km ?? 8.6;
  const postMiss = packet?.post_miss_km ?? 100;
  const burn = packet?.recommended_burn ?? null;

  // Build the Cesium viewer once when the takeover opens.
  useEffect(() => {
    if (!event || !containerRef.current || viewerRef.current) return;

    // No Ion token configured? Fall back to a tile-less ellipsoid which
    // still renders a 3D globe in dark mode.
    const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined;
    if (ionToken) {
      Cesium.Ion.defaultAccessToken = ionToken;
    }

    const viewer = new Cesium.Viewer(containerRef.current, {
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      // No imagery if no Ion token; just the dark ellipsoid.
      baseLayer: ionToken ? undefined : (false as never),
    });

    // Dark backdrop and subtle blue atmosphere
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#050608");
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.show = true;
    }
    viewer.scene.globe.enableLighting = false;
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#0e1620");

    viewerRef.current = viewer;

    return () => {
      try {
        viewer.destroy();
      } catch {
        /* ignored */
      }
      viewerRef.current = null;
    };
  }, [event]);

  // Populate / re-populate the geometry whenever takeoverEvent or its packet
  // changes.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!event || !viewer) return;

    viewer.entities.removeAll();

    const { lat, lng } = pickClosestApproachLocation(
      event.source_signal_ids,
      signalsById,
    );

    // Inspector path — passes through (lat, lng). arcType=NONE so the
    // 33-point polyline interpolates as straight 3D segments at orbital
    // altitude rather than collapsing onto the ellipsoid as a geodesic.
    viewer.entities.add({
      name: "Inspector trajectory",
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights(
          makeTrack(lat, lng, 0),
        ),
        width: 5,
        material: Cesium.Color.fromCssColorString("#cbd5e1"),
        arcType: Cesium.ArcType.NONE,
        clampToGround: false,
      },
    });

    // Pre-burn friendly path — offset by pre_miss_km.
    viewer.entities.add({
      name: `Pre-burn (miss ${preMiss.toFixed(1)} km)`,
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights(
          makeTrack(lat, lng, preMiss),
        ),
        width: 6,
        material: Cesium.Color.fromCssColorString("#ef4444"),
        arcType: Cesium.ArcType.NONE,
      },
    });

    // Post-burn friendly path — offset by post_miss_km.
    viewer.entities.add({
      name: `Post-burn (miss ${postMiss.toFixed(1)} km)`,
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights(
          makeTrack(lat, lng, postMiss),
        ),
        width: 6,
        material: Cesium.Color.fromCssColorString("#22c55e"),
        arcType: Cesium.ArcType.NONE,
      },
    });

    // Marker at the closest-approach point.
    viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lng, lat, ORBIT_ALT_KM * 1000),
      point: {
        pixelSize: 14,
        color: Cesium.Color.fromCssColorString("#ef4444"),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
      },
      label: {
        text: `TCA  ${preMiss.toFixed(1)} → ${postMiss.toFixed(1)} km`,
        font: "13px JetBrains Mono, monospace",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -18),
      },
    });

    // Auto-frame the bounding sphere of the polylines + marker. Cesium picks
    // a camera distance and orientation that fits everything in view; we
    // just nudge the heading/pitch so the geometry reads as "looking down
    // and slightly forward from the south."
    void viewer
      .flyTo(viewer.entities, {
        duration: 1.5,
        offset: new Cesium.HeadingPitchRange(
          0,
          Cesium.Math.toRadians(-30),
          1_400_000,
        ),
      })
      .catch(() => {
        // flyTo returns a Promise that rejects if the takeover closes
        // mid-flight — silently ignore that race.
      });
  }, [event, signalsById, preMiss, postMiss]);

  if (!event) return null;

  return (
    <div className="takeover-overlay" onClick={close}>
      <div className="takeover" onClick={(e) => e.stopPropagation()}>
        <div className="takeover__head">
          <span className="takeover__title">
            {burn?.sat ?? "Friendly asset"} · {burn?.dv_m_s ?? "?"} m/s prograde
            · miss {preMiss.toFixed(1)} → {postMiss.toFixed(1)} km
          </span>
          <button
            type="button"
            className="takeover__close"
            onClick={close}
            aria-label="Close orbital takeover"
          >
            ×
          </button>
        </div>
        <div className="takeover__globe" ref={containerRef} />
        <div className="takeover__legend">
          <div className="takeover__legend-item">
            <span
              className="takeover__legend-swatch"
              style={{ background: "#94a3b8" }}
            />
            Inspector trajectory
          </div>
          <div className="takeover__legend-item">
            <span
              className="takeover__legend-swatch"
              style={{ background: "#ef4444" }}
            />
            Pre-burn friendly · {preMiss.toFixed(1)} km miss
          </div>
          <div className="takeover__legend-item">
            <span
              className="takeover__legend-swatch"
              style={{ background: "#22c55e" }}
            />
            Post-burn friendly · {postMiss.toFixed(1)} km miss
          </div>
        </div>
      </div>
    </div>
  );
}
