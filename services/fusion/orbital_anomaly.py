import json
import sys

CORRELATION_WINDOW = 120
OVERLAP_BOOST = 0.15
RF_BOOST = 0.10
GNSS_BOOST = 0.15

open_windows = {}
recent_correlations = []
seen_signals = set()
emitted_anomalies = set()


def event_time(event):
    return event.get("time")


def satellite_name(event, payload):
    return (
        payload.get("satellite")
        or payload.get("object_id")
        or payload.get("asset")
        or event.get("source")
        or "unknown"
    )


def clamp(value, low=0, high=1):
    return max(low, min(high, value))


def compact_event(event, kind):
    payload = event.get("payload", {})
    return {
        "id": event.get("id"),
        "time": event_time(event),
        "domain": event.get("domain"),
        "kind": kind,
        "event_type": payload.get("event_type") or payload.get("event"),
        "source": event.get("source")
    }


def is_rf_anomaly(event):
    if event.get("domain") not in ("rf", "rf_ew"):
        return False

    payload = event.get("payload", {})
    text = " ".join([
        str(payload.get("event_type", "")),
        str(payload.get("event", "")),
        str(payload.get("signal_type", "")),
        str(payload.get("summary", ""))
    ]).lower()

    return any(token in text for token in [
        "anomaly",
        "interference",
        "jam",
        "degradation",
        "spoof"
    ])


def is_gnss_spoof(event):
    if event.get("domain") not in ("gnss", "pnt"):
        return False

    payload = event.get("payload", {})
    text = " ".join([
        str(payload.get("event_type", "")),
        str(payload.get("event", "")),
        str(payload.get("effect_type", "")),
        str(payload.get("summary", ""))
    ]).lower()

    return "spoof" in text


def prune_correlations(now):
    if now is None:
        return

    recent_correlations[:] = [
        item for item in recent_correlations
        if item.get("time") is not None and now - item["time"] <= CORRELATION_WINDOW
    ]


def correlated_events(now):
    if now is None:
        return []

    return [
        item for item in recent_correlations
        if item.get("time") is not None and abs(now - item["time"]) <= CORRELATION_WINDOW
    ]


def anomaly_id(kind, source_signal, suffix=None):
    if suffix:
        return "anom-" + kind + "-" + source_signal + "-" + suffix

    return "anom-" + kind + "-" + source_signal


def emit_anomaly(kind, event, severity, payload, suffix=None):
    source_signal = event["id"]
    anom_id = anomaly_id(kind, source_signal, suffix)

    if anom_id in emitted_anomalies:
        return

    anomaly = {
        "id": anom_id,
        "time": event_time(event),
        "kind": kind,
        "source_signal": source_signal,
        "severity": clamp(round(severity, 3)),
        "payload": payload
    }

    emitted_anomalies.add(anom_id)
    print("anomalies.orbit " + json.dumps(anomaly), flush=True)


def severity_with_context(risk, overlaps, correlations):
    severity = risk

    if overlaps:
        severity += OVERLAP_BOOST

    if any(item["kind"] == "rf_anomaly" for item in correlations):
        severity += RF_BOOST

    if any(item["kind"] == "gnss_spoof" for item in correlations):
        severity += GNSS_BOOST

    return severity


def handle_collection_start(event, payload):
    now = event_time(event)
    satellite = satellite_name(event, payload)
    risk = payload.get("risk", 0)
    overlaps = [
        {
            "satellite": sat,
            "source_signal": window["source_signal"],
            "start_time": window["start_time"],
            "risk": window["risk"]
        }
        for sat, window in open_windows.items()
        if sat != satellite
    ]
    correlations = correlated_events(now)
    kind = "orbital_collection_overlap" if overlaps else "orbital_collection_risk"

    open_windows[satellite] = {
        "source_signal": event["id"],
        "start_time": now,
        "risk": risk
    }

    emit_anomaly(kind, event, severity_with_context(risk, overlaps, correlations), {
        "satellite": satellite,
        "window_type": "collection_window_start",
        "window_state": "open",
        "overlap_detected": bool(overlaps),
        "overlapping_windows": overlaps,
        "correlated_events": correlations,
        "recommended_response": "low_observable_mode",
        "confidence": 0.9
    })


def handle_collection_end(event, payload):
    satellite = satellite_name(event, payload)
    open_windows.pop(satellite, None)


def handle_correlation_event(event, kind):
    now = event_time(event)
    if now is None:
        return

    compact = compact_event(event, kind)
    recent_correlations.append(compact)
    prune_correlations(now)

    for satellite, window in open_windows.items():
        if abs(now - window["start_time"]) > CORRELATION_WINDOW:
            continue

        emit_anomaly("orbital_collection_correlated", event, severity_with_context(
            window["risk"],
            [],
            [compact]
        ), {
            "satellite": satellite,
            "window_type": "collection_window_active",
            "window_state": "open",
            "source_window_signal": window["source_signal"],
            "correlated_events": [compact],
            "recommended_response": "low_observable_mode",
            "confidence": 0.85
        }, window["source_signal"])


for line in sys.stdin:
    line = line.strip()
    if not line:
        continue

    parts = line.split(" ", 1)
    if len(parts) != 2:
        continue

    topic, raw = parts
    event = json.loads(raw)
    event_id = event.get("id")

    if not event_id or event_id in seen_signals:
        continue

    seen_signals.add(event_id)

    if is_rf_anomaly(event):
        handle_correlation_event(event, "rf_anomaly")
        continue

    if is_gnss_spoof(event):
        handle_correlation_event(event, "gnss_spoof")
        continue

    if event.get("domain") != "orbit":
        continue

    now = event_time(event)
    prune_correlations(now)

    payload = event.get("payload", {})
    event_type = payload.get("event") or payload.get("event_type")

    if event_type == "collection_window_start":
        handle_collection_start(event, payload)
        continue

    if event_type == "collection_window_end":
        handle_collection_end(event, payload)
