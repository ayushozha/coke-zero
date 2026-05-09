from __future__ import annotations

WATCH_SIGNAL_DELIMITER = "__watch_"


def watch_signal_id(signal_id: str, run_id: str) -> str:
    """Return a unique per-watch-cycle id while preserving the base id prefix."""
    return f"{base_signal_id(signal_id)}{WATCH_SIGNAL_DELIMITER}{run_id}"


def base_signal_id(signal_id: str) -> str:
    """Strip the mission-watch suffix used for repeatable autonomous cycles."""
    return signal_id.split(WATCH_SIGNAL_DELIMITER, 1)[0]
