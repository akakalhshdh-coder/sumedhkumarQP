"""True uptime timer: seconds since the server process booted.

The desk shows how long THIS live run has lasted without a break. The
counter starts at 0 when the server process starts and grows forever —
there is no midnight reset, no 24-hour cap, no wrap, no off hour, no
pause. A deploy or a server restart starts a fresh process, so the timer
honestly goes back to 0: the number is only ever as old as the current
run. (The earlier version counted seconds since Dhaka midnight, which
read "12h" on a server that had been up for minutes — wrong, and the
user caught it.)

PROCESS_STARTED_AT is set at import time. The server imports this module
at boot (backend/main.py imports it at the top), so import time is, for
all practical purposes, boot time.

Pure functions only (no I/O) so they are trivially testable.
"""
from __future__ import annotations

from datetime import datetime, timezone

# Set once, when this module is first imported at server boot.
PROCESS_STARTED_AT = datetime.now(timezone.utc)


def uptime_state(now_utc: datetime, started_at: datetime | None = None) -> dict:
    """Describe the true uptime at a UTC instant.

    Returns {"uptime_seconds": int, "started_at": str,
    "timezone": "Asia/Dhaka"}.

    uptime_seconds = seconds from started_at to now, clamped at 0
    (a started_at in the future reads as 0, never negative).
    started_at defaults to PROCESS_STARTED_AT (this process's boot).
    A naive datetime is treated as UTC. The value grows without limit.
    """
    if started_at is None:
        started_at = PROCESS_STARTED_AT
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    uptime = max(0, int((now_utc - started_at).total_seconds()))
    return {"uptime_seconds": uptime,
            "started_at": started_at.isoformat(),
            "timezone": "Asia/Dhaka"}


__all__ = ["PROCESS_STARTED_AT", "uptime_state"]
