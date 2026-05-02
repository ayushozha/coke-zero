import json
import sys

THRESHOLD = 0.8

for line in sys.stdin:
    line = line.strip()

    if not line:
        continue

    # replay prints: "signals.orbit {...json...}"
    parts = line.split(" ", 1)
    if len(parts) != 2:
        continue

    topic, raw = parts
    event = json.loads(raw)

    if event.get("domain") != "orbit":
        continue

    payload = event.get("payload", {})
    risk = payload.get("risk", 0)

    if risk < THRESHOLD:
        continue

    anomaly = {
        "id": "anom-" + event["id"],
        "time": event["time"],
        "kind": "orbital_collection_risk",
        "source_signal": event["id"],
        "severity": risk,
        "payload": {
            "satellite": payload.get("satellite"),
            "trigger": payload.get("event"),
            "recommended_response": "low_observable_mode"
        }
    }

    print("anomalies.orbit " + json.dumps(anomaly), flush=True)
