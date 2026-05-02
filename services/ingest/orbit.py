def make_signal(id, t, source, payload):
    return {
        "id": id,
        "time": t,
        "domain": "orbit",
        "source": source,
        "payload": payload
    }

def overpass_detected(id, t, sat, risk):
    return make_signal(id, t, sat, {
        "event": "overpass_detected",
        "satellite": sat,
        "risk": risk
    })

def collection_start(id, t, sat, risk):
    return make_signal(id, t, sat, {
        "event": "collection_window_start",
        "satellite": sat,
        "risk": risk
    })

def collection_end(id, t, sat, risk):
    return make_signal(id, t, sat, {
        "event": "collection_window_end",
        "satellite": sat,
        "risk": risk
    })
