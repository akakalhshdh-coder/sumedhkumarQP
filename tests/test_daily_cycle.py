"""Tests for the true-uptime timer (backend/core/daily_cycle.py).

The timer counts seconds since the server process booted. It has no
midnight reset, no 24-hour cap and no wrap: it grows forever and goes
back to 0 only when the process restarts.
"""
from __future__ import annotations

from datetime import datetime, timezone

from backend.core.daily_cycle import PROCESS_STARTED_AT, uptime_state


def utc(y, mo, d, h, mi=0, s=0):
    return datetime(y, mo, d, h, mi, s, tzinfo=timezone.utc)


START = utc(2026, 11, 22, 6, 0, 0)  # a fixed fake boot instant


def test_zero_at_boot():
    st = uptime_state(START, START)
    assert st == {"uptime_seconds": 0, "started_at": START.isoformat(),
                  "timezone": "Asia/Dhaka"}


def test_ninety_seconds_after_boot():
    st = uptime_state(utc(2026, 11, 22, 6, 1, 30), START)
    assert st["uptime_seconds"] == 90
    assert st["started_at"] == START.isoformat()


def test_no_24h_reset_or_wrap():
    # 25 hours after boot the counter is 90_000, NOT 3_600 (no wrap).
    st = uptime_state(utc(2026, 11, 23, 7, 0, 0), START)
    assert st["uptime_seconds"] == 25 * 3600  # 90_000
    assert st["started_at"] == START.isoformat()


def test_naive_datetime_is_treated_as_utc():
    st = uptime_state(datetime(2026, 11, 22, 6, 1, 30), START)
    assert st["uptime_seconds"] == 90


def test_future_start_clamps_to_zero():
    # started_at after now never reads negative.
    st = uptime_state(START, utc(2026, 11, 22, 7, 0, 0))
    assert st["uptime_seconds"] == 0


def test_default_started_at_is_process_boot():
    st = uptime_state(datetime.now(timezone.utc))
    assert st["started_at"] == PROCESS_STARTED_AT.isoformat()
    assert st["uptime_seconds"] >= 0
