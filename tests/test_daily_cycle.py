"""Tests for the live timer (backend/core/daily_cycle.py).

Dhaka is UTC+6 with no DST, so a Dhaka wall time HH:MM equals UTC
HH-6:MM the same UTC day (for HH >= 06:00) — the test inputs below are
UTC instants chosen so the Dhaka wall time is exactly the case named in
each test's docstring.
"""
from __future__ import annotations

from datetime import datetime, timezone

from backend.core.daily_cycle import live_state


def utc(y, mo, d, h, mi=0, s=0):
    return datetime(y, mo, d, h, mi, s, tzinfo=timezone.utc)


def test_midnight_dhaka_resets_to_zero():
    # Dhaka 00:00 = UTC 18:00 the previous day; next reset is Dhaka
    # midnight the following day = UTC 18:00 today.
    st = live_state(utc(2026, 11, 21, 18, 0, 0))
    assert st == {"live_seconds_today": 0, "resets_at": "2026-11-22T18:00:00+00:00",
                  "timezone": "Asia/Dhaka"}


def test_noon_dhaka_is_half_a_day():
    # Dhaka 12:00 = UTC 06:00; next reset is UTC 18:00 the same day.
    st = live_state(utc(2026, 11, 22, 6, 0, 0))
    assert st["live_seconds_today"] == 12 * 3600
    assert st["resets_at"] == "2026-11-22T18:00:00+00:00"
    assert st["timezone"] == "Asia/Dhaka"


def test_one_second_before_midnight_dhaka():
    # Dhaka 23:59:59 = UTC 17:59:59; one second later the timer resets.
    st = live_state(utc(2026, 11, 22, 17, 59, 59))
    assert st["live_seconds_today"] == 24 * 3600 - 1  # 86_399
    assert st["resets_at"] == "2026-11-22T18:00:00+00:00"


def test_just_after_midnight_counts_from_zero_again():
    # Dhaka 00:00:01 = UTC 18:00:01 the previous day.
    st = live_state(utc(2026, 11, 21, 18, 0, 1))
    assert st["live_seconds_today"] == 1
    assert st["resets_at"] == "2026-11-22T18:00:00+00:00"


def test_naive_datetime_is_treated_as_utc():
    # Same instant as test_midnight_dhaka_resets_to_zero, without tzinfo.
    st = live_state(datetime(2026, 11, 21, 18, 0, 0))
    assert st["live_seconds_today"] == 0
    assert st["resets_at"] == "2026-11-22T18:00:00+00:00"
