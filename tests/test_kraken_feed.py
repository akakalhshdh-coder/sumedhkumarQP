"""Tests for the Kraken BTC/USD live feed (backend/core/kraken_feed.py).

Live tests hit the real public Kraken API (no key). They assert the feed
returns real market prices (~$60k), never the synthetic demo base ($95k).
Stub tests cover close detection and failure handling deterministically.
"""
from __future__ import annotations

import time

import pytest

from backend.core.kraken_feed import KrakenFeed, parse_candle


# ---------------------------------------------------------------- helpers
class StubResp:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


def ohlc_payload(times, base_price=60000.0):
    rows = []
    for i, t in enumerate(times):
        p = base_price + i * 10
        rows.append([t, f"{p:.1f}", f"{p + 5:.1f}", f"{p - 5:.1f}", f"{p + 2:.1f}", f"{p:.1f}", "0.5", 10])
    return {"error": [], "result": {"XXBTZUSD": rows, "last": times[-1]}}


class StubClient:
    """Returns canned OHLC payloads in sequence, then repeats the last one."""

    def __init__(self, payloads):
        self._payloads = payloads
        self._i = 0

    def get(self, url, params=None):
        if "Ticker" in url:
            return StubResp({"error": [], "result": {"XXBTZUSD": {"a": ["60120.10", "2", "2.0"],
                                                                   "b": ["60120.00", "1", "1.0"]}}})
        p = self._payloads[min(self._i, len(self._payloads) - 1)]
        self._i += 1
        return StubResp(p)

    def close(self):
        pass


# ---------------------------------------------------------------- parsing
def test_parse_native_5m_candle():
    raw = [1795304400, "60120.1", "60135.7", "60110.0", "60130.5", "60122.0", "1.31290025", 144]
    assert parse_candle(raw) == {"time": 1795304400, "open": 60120.1, "high": 60135.7,
                                 "low": 60110.0, "close": 60130.5, "volume": 1.31290025}
    assert isinstance(parse_candle(raw)["time"], int)


# ---------------------------------------------------------------- close detection (stub, deterministic)
def test_poll_new_emits_just_closed_candle():
    now_bucket = (int(time.time()) // 300) * 300
    b0, b1, b2, b3 = now_bucket - 900, now_bucket - 600, now_bucket - 300, now_bucket
    filler = [b0 - (100 - i) * 300 for i in range(100)]  # seed() needs >= 100 rows
    stub = StubClient([ohlc_payload(filler + [b0, b1, b2]), ohlc_payload(filler + [b0, b1, b2, b3])])
    feed = KrakenFeed(client=stub)
    assert feed.seed() is True
    assert feed._last_closed_time == b1
    new = feed.poll_new()
    assert new["BTCUSD"]["time"] == b2
    assert new["BTCUSD"]["close"] == pytest.approx(61022.0)
    assert feed.poll_new() == {}  # nothing new closed on the next poll
    assert feed.spread_points("BTCUSD") == pytest.approx(10.0)  # (ask-bid)/0.01


def test_spread_points_deterministic_default():
    feed = KrakenFeed(client=StubClient([ohlc_payload([int(time.time()) // 300 * 300])]))
    assert feed.spread_points("BTCUSD") == 100.0
    assert feed.spread_points("BTCUSD") == feed.spread_points("BTCUSD")


def test_unknown_instrument_raises():
    feed = KrakenFeed(client=StubClient([]))
    with pytest.raises(KeyError):
        feed.candles("XAUUSD", 10)
    with pytest.raises(KeyError):
        feed.last_price("XAUUSD")


# ---------------------------------------------------------------- failure handling
def test_seed_failure_returns_false_without_crashing():
    bad = KrakenFeed(base_url="https://127.0.0.1:9")
    assert bad.seed() is False
    assert bad.ready is False
    assert bad.poll_new() == {}
    assert bad.last_error


# ---------------------------------------------------------------- live API
def test_seed_live_native_5m():
    """One seed call returns ~2.5 days of real 5m candles ending minutes ago."""
    feed = KrakenFeed()
    assert feed.seed() is True
    assert feed.ready
    assert len(feed._candles) >= 500
    now = int(time.time())
    first, last = feed._candles[0], feed._candles[-1]
    assert now - first["time"] <= int(2.6 * 86400)  # within ~2.5 days
    assert now - last["time"] < 360  # last (in-progress) candle < 6 min old
    assert abs(last["close"] - 60000) / 60000 <= 0.02  # real market, ~$60k
    assert abs(last["close"] - 95000) / 95000 > 0.01  # NOT the synthetic demo base
    assert feed.last_price("BTCUSD") == last["close"]
    assert len(feed.candles("BTCUSD", 500)) == 500
    for c in feed.candles("BTCUSD", 5):
        assert set(c) == {"time", "open", "high", "low", "close", "volume"}
        assert isinstance(c["time"], int) and isinstance(c["close"], float)


def test_live_poll_two_cycles_never_raises():
    feed = KrakenFeed()
    assert feed.seed() is True
    for _ in range(2):
        assert isinstance(feed.poll_new(), dict)
    assert 0.0 < feed.spread_points("BTCUSD") < 3000.0  # inside the Guardian limit
