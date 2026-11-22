"""Live timer: seconds since Dhaka midnight, resetting at 00:00 Asia/Dhaka.

The model runs live 24/7 — there is no off hour and no pause. This module
only answers "how long has today been live", so the desk can show a timer
that counts up through the day and goes back to 00h 00m 00s at midnight.

Pure functions only (no I/O) so they are trivially testable.

Note on timezones: Dhaka is UTC+6 year-round with no DST, so the offset is
a fixed datetime.timezone(timedelta(hours=6)). No tzdata / zoneinfo
dependency is needed, and the behaviour can never shift with a DST change.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

# Fixed offset, no DST in Dhaka — see module docstring.
DHAKA = timezone(timedelta(hours=6))

DAY_SECONDS = 24 * 3600  # 86_400


def live_state(now_utc: datetime) -> dict:
    """Describe the live timer at a UTC instant.

    Returns {"live_seconds_today": int, "resets_at": str,
    "timezone": "Asia/Dhaka"}.

    live_seconds_today = seconds from Dhaka midnight to now (0-86_399).
    resets_at = ISO-8601 of the next Dhaka midnight, in UTC.
    A naive datetime is treated as UTC.
    """
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)
    dhaka = now_utc.astimezone(DHAKA)
    midnight = dhaka.replace(hour=0, minute=0, second=0, microsecond=0)
    live_seconds = int((dhaka - midnight).total_seconds())
    next_midnight = midnight + timedelta(days=1)
    return {"live_seconds_today": live_seconds,
            "resets_at": next_midnight.astimezone(timezone.utc).isoformat(),
            "timezone": "Asia/Dhaka"}


__all__ = ["DHAKA", "DAY_SECONDS", "live_state"]
