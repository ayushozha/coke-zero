from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from halo.services.bus import Bus
from halo.services.schemas.events import Anomaly, Signal

log = logging.getLogger(__name__)

__all__ = ["FusionService"]

# Sliding window (seconds) for cross-domain correlation. Matches the prior
# value baked into services/fusion/orbital_anomaly.py.
CORRELATION_WINDOW_S = 120

# Severity boosts when an orbital event correlates with concurrent activity.
OVERLAP_BOOST = 0.15
RF_BOOST = 0.10
GNSS_BOOST = 0.15

# Tokens used to recognise RF anomaly / GNSS spoof signals from the canonical
# payload event_type plus its summary text. Mirrors the prototype script.
RF_ANOMALY_TOKENS = ("anomaly", "interference", "jam", "degradation", "spoof")
GNSS_SPOOF_TOKEN = "spoof"

# Per-domain event_type → anomaly kind mappings for the simple "echo this as
# an anomaly" path. Orbital event_types are handled by the correlator below.
DOMAIN_PATTERN_MAP: dict[tuple[str, str], str] = {
    # RF / EW
    ("rf_ew", "rf_interference"): "rf_anomaly",
    ("rf_ew", "satcom_rf_spike"): "rf_anomaly",
    ("rf_ew", "gnss_jamming_signature"): "rf_gnss_jamming",
    ("rf_ew", "uas_control_link_detected"): "rf_uas_control_link",
    ("rf_ew", "emission_posture_risk"): "rf_emission_posture_risk",
    ("rf_ew", "telemetry_degradation"): "rf_telemetry_degradation",
    # PNT / GNSS
    ("pnt", "pnt_spoofing"): "gnss_spoof",
    ("pnt", "pnt_rf_alignment"): "gnss_spoof",
    ("pnt", "gps_spoof"): "gnss_spoof",
    # Cyber
    ("cyber", "credential_spray"): "cyber_probe_burst",
    ("cyber", "credential_probe"): "cyber_probe_burst",
    ("cyber", "process_anomaly"): "cyber_probe_burst",
    ("cyber", "intrusion"): "cyber_probe_burst",
    ("cyber", "response_action"): "cyber_response_action",
    # SATCOM
    ("satcom", "satcom_degradation"): "satcom_degradation",
    ("satcom", "satcom_link_margin_drop"): "satcom_degradation",
    ("satcom", "telemetry_degradation"): "satcom_degradation",
    # SDA
    ("sda", "sda_catalog_match"): "sda_catalog_match",
    ("sda", "maritime_space_picture_shift"): "sda_maritime_picture_shift",
    ("sda", "overhead_ir_cue"): "sda_overhead_ir_cue",
    ("sda", "counterspace_capability_context"): "sda_counterspace_context",
    # Drone — both threat (spoof, lost link) and protective (FDIR, relay)
    ("drone", "drone_spoofing"): "drone_spoofing",
    ("drone", "lost_link"): "drone_lost_link",
    ("drone", "degraded_telemetry"): "drone_degraded",
    ("drone", "autonomous_relay_handoff"): "drone_relay_handoff",
    ("drone", "relay_candidate_ready"): "drone_relay_candidate_ready",
    ("drone", "relay_mesh_status"): "drone_relay_mesh_status",
    ("drone", "fdir_recovery_action"): "drone_fdir_recovery",
    ("drone", "base_defense_posture_change"): "drone_base_defense_posture",
    ("drone", "uas_track_detected"): "drone_uas_track",
    # Terrain
    ("terrain", "terrain_masking_risk"): "terrain_masking_risk",
    # HUMINT
    ("humint", "procurement_report"): "humint_report",
    # OSINT — assessments and contexts (correlation outputs from upstream cells)
    ("osint", "convergence"): "osint_convergence",
    ("osint", "commander_update"): "osint_commander_update",
    ("osint", "close_approach_assessment"): "osint_close_approach_assessment",
    ("osint", "campaign_assessment"): "osint_campaign_assessment",
    ("osint", "collection_cue"): "osint_collection_cue",
    ("osint", "multi_domain_attack_assessment"): "osint_multi_domain_attack",
    ("osint", "iran_counter_c5isr_assessment"): "osint_iran_c5isr_assessment",
    ("osint", "space_support_hold_recommendation"): "osint_space_support_hold",
    ("osint", "space_enabled_base_defense_assessment"): "osint_space_base_defense",
    ("osint", "collection_risk_assessment"): "osint_collection_risk",
    ("osint", "relay_resilience_assessment"): "osint_relay_resilience",
    ("osint", "fdir_assessment"): "osint_fdir_assessment",
    ("osint", "blockade_notice"): "osint_blockade_notice",
    ("osint", "missile_uas_capability_context"): "osint_missile_uas_context",
    ("osint", "militia_uas_risk_context"): "osint_militia_uas_context",
}

# Event types we deliberately do not emit anomalies for — baseline / context /
# informational signals. They still get logged as "seen" but the engine
# remains quiet rather than producing low-value threat warnings.
IGNORED_EVENT_TYPES: set[tuple[str, str]] = {
    ("cyber", "ground_segment_baseline"),
    ("drone", "telemetry_update"),
    ("osint", "osint_context"),
    ("osint", "public_report"),
}

# Orbit-domain event types handled by the orbital correlator below. Anything
# in this set is "covered"; anything outside it on `domain == "orbit"` would
# fall through silently. The coverage regression test imports this constant.
ORBIT_EVENT_TYPES: set[str] = {
    "collection_window_start",
    "overhead_collection_window",
    "collection_window_end",
    "rpo_close_approach",
    "proximity_operations",
    "screening_overlay",
    "orbital_context_shift",
    "orbital_setup",
}


@dataclass
class _CollectionWindow:
    source_signal: str
    start_ts_s: float
    risk: float


@dataclass
class _Correlation:
    signal_id: str
    kind: str
    ts_s: float
    domain: str
    event_type: str | None
    source: str | None


@dataclass
class _State:
    open_windows: dict[str, _CollectionWindow] = field(default_factory=dict)
    recent_correlations: list[_Correlation] = field(default_factory=list)
    seen_signals: set[str] = field(default_factory=set)
    emitted_anomaly_ids: set[str] = field(default_factory=set)


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def _ts_seconds(signal: Signal) -> float:
    return signal.ts.timestamp()


def _satellite_name(signal: Signal) -> str:
    obs = signal.payload.observables or {}
    return (
        obs.get("satellite")
        or obs.get("object_id")
        or obs.get("target")
        or signal.payload.asset
        or signal.source
        or "unknown"
    )


def _is_rf_anomaly(signal: Signal) -> bool:
    if signal.domain not in ("rf_ew",):
        return False
    text = " ".join(
        [signal.payload.event_type, signal.payload.summary or ""]
    ).lower()
    return any(token in text for token in RF_ANOMALY_TOKENS)


def _is_gnss_spoof(signal: Signal) -> bool:
    if signal.domain != "pnt":
        return False
    text = " ".join(
        [signal.payload.event_type, signal.payload.summary or ""]
    ).lower()
    return GNSS_SPOOF_TOKEN in text


class FusionService:
    """Cross-domain correlator over canonical Signals.

    Two emission paths run side by side per signal:

    1. **Domain pattern map** — payload.event_type is mapped to an anomaly
       kind. The anomaly carries a summary, the source signal id, and the
       location/asset from the originating signal. Severity defaults to the
       signal's own confidence.

    2. **Orbital correlator** — ported from services/fusion/orbital_anomaly.py.
       Tracks orbital collection windows, RF anomalies, and GNSS spoof events
       within a sliding 120 s window and emits orbital_* anomalies whose
       severity is boosted when concurrent multi-domain activity is observed.

    Both paths can fire for the same signal (e.g., an RF interference signal
    produces an `rf_anomaly` directly and also feeds the orbital correlator).
    """

    def __init__(self, bus: Bus) -> None:
        self._bus = bus
        self._state = _State()

    async def run(self) -> None:
        async for topic, event in self._bus.subscribe("signals.*"):
            if not isinstance(event, Signal):
                log.warning("fusion: non-Signal on %s: %r", topic, type(event))
                continue
            await self._dispatch(event)

    # ---- Dispatch ---------------------------------------------------------

    async def _dispatch(self, signal: Signal) -> None:
        if signal.id in self._state.seen_signals:
            return
        self._state.seen_signals.add(signal.id)
        now = _ts_seconds(signal)
        self._prune_correlations(now)

        event_type = signal.payload.event_type
        domain = signal.domain

        if (domain, event_type) in IGNORED_EVENT_TYPES:
            log.debug("fusion: ignoring baseline %s/%s", domain, event_type)
            return

        # 1) Per-domain pattern echo (works for every domain except orbit,
        # which has its own correlator below).
        kind = DOMAIN_PATTERN_MAP.get((domain, event_type))
        if kind:
            await self._emit_pattern_anomaly(signal, kind)

        # 2) Cross-domain correlation cues (RF anomaly / GNSS spoof) feed the
        # correlator buffer and may trigger an orbital_collection_correlated
        # emission against any open window.
        if _is_rf_anomaly(signal):
            await self._handle_correlation_event(signal, "rf_anomaly")
        elif _is_gnss_spoof(signal):
            await self._handle_correlation_event(signal, "gnss_spoof")

        # 3) Orbital handlers.
        if domain == "orbit":
            if event_type in ("collection_window_start", "overhead_collection_window"):
                await self._handle_collection_start(signal)
            elif event_type == "collection_window_end":
                self._handle_collection_end(signal)
            elif event_type in (
                "rpo_close_approach",
                "proximity_operations",
                "screening_overlay",
            ):
                await self._handle_rpo(signal)
            elif event_type in ("orbital_context_shift", "orbital_setup"):
                # Track but do not emit.
                pass

    # ---- Helpers ----------------------------------------------------------

    def _prune_correlations(self, now: float) -> None:
        self._state.recent_correlations[:] = [
            c
            for c in self._state.recent_correlations
            if now - c.ts_s <= CORRELATION_WINDOW_S
        ]

    def _correlated(self, now: float) -> list[_Correlation]:
        return [
            c
            for c in self._state.recent_correlations
            if abs(now - c.ts_s) <= CORRELATION_WINDOW_S
        ]

    def _severity_with_context(
        self, base: float, *, overlaps: bool, correlations: list[_Correlation]
    ) -> float:
        sev = base
        if overlaps:
            sev += OVERLAP_BOOST
        if any(c.kind == "rf_anomaly" for c in correlations):
            sev += RF_BOOST
        if any(c.kind == "gnss_spoof" for c in correlations):
            sev += GNSS_BOOST
        return _clamp01(round(sev, 3))

    async def _publish(self, anomaly: Anomaly) -> None:
        if anomaly.id in self._state.emitted_anomaly_ids:
            return
        self._state.emitted_anomaly_ids.add(anomaly.id)
        await self._bus.publish(f"anomalies.{anomaly.kind}", anomaly)
        log.info(
            "fusion published anomaly id=%s kind=%s severity=%.2f",
            anomaly.id,
            anomaly.kind,
            anomaly.severity,
        )

    def _build_anomaly(
        self,
        *,
        kind: str,
        signal: Signal,
        severity: float,
        payload: dict[str, Any],
        suffix: str | None = None,
    ) -> Anomaly:
        anomaly_id = (
            f"anom-{kind}-{signal.id}-{suffix}" if suffix else f"anom-{kind}-{signal.id}"
        )
        return Anomaly(
            id=anomaly_id,
            ts=signal.ts,
            kind=kind,
            source_signal=signal.id,
            source_signal_ids=[signal.id],
            severity=_clamp01(round(severity, 3)),
            payload=payload,
        )

    # ---- Path 1: per-domain pattern echo ---------------------------------

    async def _emit_pattern_anomaly(self, signal: Signal, kind: str) -> None:
        payload: dict[str, Any] = {
            "domain": signal.domain,
            "event_type": signal.payload.event_type,
            "summary": signal.payload.summary,
            "asset": signal.payload.asset,
            "observables": signal.payload.observables or {},
            "confidence": signal.confidence,
            "source": signal.source,
        }
        await self._publish(
            self._build_anomaly(
                kind=kind,
                signal=signal,
                severity=signal.confidence,
                payload=payload,
            )
        )

    # ---- Path 2: orbital correlator (ported) -----------------------------

    async def _handle_collection_start(self, signal: Signal) -> None:
        now = _ts_seconds(signal)
        sat = _satellite_name(signal)
        risk = float((signal.payload.observables or {}).get("risk", signal.confidence))
        overlaps = [
            {
                "satellite": other,
                "source_signal": w.source_signal,
                "start_time": w.start_ts_s,
                "risk": w.risk,
            }
            for other, w in self._state.open_windows.items()
            if other != sat
        ]
        correlations = self._correlated(now)

        self._state.open_windows[sat] = _CollectionWindow(
            source_signal=signal.id, start_ts_s=now, risk=risk
        )

        kind = "orbital_collection_overlap" if overlaps else "orbital_collection_risk"
        severity = self._severity_with_context(
            risk, overlaps=bool(overlaps), correlations=correlations
        )
        await self._publish(
            self._build_anomaly(
                kind=kind,
                signal=signal,
                severity=severity,
                payload={
                    "satellite": sat,
                    "window_state": "open",
                    "overlap_detected": bool(overlaps),
                    "overlapping_windows": overlaps,
                    "correlated_events": [self._compact(c) for c in correlations],
                    "recommended_response": "low_observable_mode",
                    "summary": signal.payload.summary,
                },
            )
        )

    def _handle_collection_end(self, signal: Signal) -> None:
        sat = _satellite_name(signal)
        self._state.open_windows.pop(sat, None)

    async def _handle_rpo(self, signal: Signal) -> None:
        now = _ts_seconds(signal)
        observables = signal.payload.observables or {}
        miss_km = observables.get("miss_distance_km")
        range_km = observables.get("range_km")
        range_value = miss_km if miss_km is not None else range_km
        correlations = self._correlated(now)
        base = signal.confidence
        if isinstance(range_value, (int, float)) and range_value <= 10:
            base = max(base, 0.82)

        severity = self._severity_with_context(
            base, overlaps=False, correlations=correlations
        )
        await self._publish(
            self._build_anomaly(
                kind="orbital_rpo_risk",
                signal=signal,
                severity=severity,
                payload={
                    "satellite": _satellite_name(signal),
                    "event_type": signal.payload.event_type,
                    "summary": signal.payload.summary,
                    "observables": observables,
                    "correlated_events": [self._compact(c) for c in correlations],
                    "recommended_response": "request_space_support_options",
                    "confidence": signal.confidence,
                },
            )
        )

    async def _handle_correlation_event(self, signal: Signal, kind: str) -> None:
        now = _ts_seconds(signal)
        correlation = _Correlation(
            signal_id=signal.id,
            kind=kind,
            ts_s=now,
            domain=signal.domain,
            event_type=signal.payload.event_type,
            source=signal.source,
        )
        self._state.recent_correlations.append(correlation)
        self._prune_correlations(now)

        for sat, window in self._state.open_windows.items():
            if abs(now - window.start_ts_s) > CORRELATION_WINDOW_S:
                continue
            severity = self._severity_with_context(
                window.risk, overlaps=False, correlations=[correlation]
            )
            await self._publish(
                self._build_anomaly(
                    kind="orbital_collection_correlated",
                    signal=signal,
                    severity=severity,
                    payload={
                        "satellite": sat,
                        "window_state": "open",
                        "source_window_signal": window.source_signal,
                        "correlated_events": [self._compact(correlation)],
                        "recommended_response": "low_observable_mode",
                        "summary": signal.payload.summary,
                    },
                    suffix=window.source_signal,
                )
            )

    @staticmethod
    def _compact(c: _Correlation) -> dict[str, Any]:
        return {
            "id": c.signal_id,
            "kind": c.kind,
            "domain": c.domain,
            "event_type": c.event_type,
            "source": c.source,
            "time": c.ts_s,
        }
