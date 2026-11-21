"""Live BTC/USD 5-minute candles from Kraken's public REST API (no key).

Kraken's native 5m candles are used directly: the strategy is 5m-calibrated
and Kraken's own 5m OHLC values are exactly the candles the desk needs, so
there is no 1m -> 5m aggregation layer. One seed call returns 720 candles
(2.5 days of history).

Polling: a candle is exposed as "new" once the next 5m bucket has started,
i.e. the previous candle is fully closed. The last row Kraken returns is
always the in-progress candle; it is kept in the candle list (so the chart
and the last price stay live) but is never emitted as a closed bar.

Never raises on transient API failure: logs, keeps last known data, retries
on the next poll. Seed failure returns False so the caller can fall back
to Demo mode.
"""
from __future__ import annotations

import logging
import os
import ssl
import time
from typing import Optional, Union

import httpx

log = logging.getLogger("quantpilot.kraken")

BASE_URL = "https://api.kraken.com/0/public"
PAIR = "XBTUSD"
INSTRUMENT = "BTCUSD"
INTERVAL = 5  # minutes; Kraken native 5m candles
FIVE_MIN = 300
POINT = 0.01  # BTCUSD digits=2, so 1 point = $0.01
DEFAULT_SPREAD_POINTS = 100.0  # ~$1.00, far inside the 3000-pt Guardian limit
REQUEST_TIMEOUT = 15.0
TICKER_MIN_INTERVAL = 60.0
STALE_AFTER = 3600.0  # re-seed if no fresh candle for over an hour
MAX_CANDLES = 2000


class KrakenError(RuntimeError):
    """Raised when a Kraken request fails or returns an error payload."""


def parse_candle(row: list) -> dict:
    """Kraken OHLC row [time, open, high, low, close, vwap, volume, count] -> desk candle."""
    return {
        "time": int(row[0]),
        "open": float(row[1]),
        "high": float(row[2]),
        "low": float(row[3]),
        "close": float(row[4]),
        "volume": float(row[6]),
    }


def _default_client() -> httpx.Client:
    """httpx client with explicit proxy + CA bundle.

    httpx's trust_env parsing crashes on this VM's NO_PROXY list (IPv6
    bracket entries), and with trust_env=False it also ignores the proxy
    and SSL_CERT_FILE variables the egress proxy needs — so read both
    explicitly. On Render neither variable exists and this degrades to a
    plain direct client with default certificate verification.
    """
    proxy = (os.getenv("HTTPS_PROXY") or os.getenv("https_proxy")
             or os.getenv("HTTP_PROXY") or os.getenv("http_proxy"))
    cafile = os.getenv("SSL_CERT_FILE")
    verify: Union[bool, ssl.SSLContext] = True
    if cafile:
        try:
            verify = ssl.create_default_context(cafile=cafile)
        except Exception:  # noqa: BLE001 - bad CA path must not break startup
            log.warning("SSL_CERT_FILE %r unusable; using default certificate verification", cafile)
            verify = True
    try:
        return httpx.Client(timeout=REQUEST_TIMEOUT, proxy=proxy or None, verify=verify, trust_env=False)
    except Exception:  # noqa: BLE001 - a malformed proxy env must never break startup
        log.warning("Kraken client fell back to a direct connection (proxy env unusable)")
        return httpx.Client(timeout=REQUEST_TIMEOUT, trust_env=False)


class KrakenFeed:
    """Holds Kraken BTCUSD 5m candles and exposes the DemoFeed-style accessors.

    Sync httpx calls: call seed()/poll_new() from asyncio.to_thread, exactly
    like the MT5 path in the orchestrator.
    """

    def __init__(self, base_url: str = BASE_URL, client: Optional[httpx.Client] = None) -> None:
        self.base_url = base_url.rstrip("/")
        self._client = client or _default_client()
        self._owns_client = client is None
        self._candles: list[dict] = []
        self._seeded = False
        self._last_seen_time: int = 0
        self._last_closed_time: int = 0
        self._spread_points: float = DEFAULT_SPREAD_POINTS
        self._last_ticker_at: float = 0.0
        self._consecutive_failures: int = 0
        self.last_error: Optional[str] = None

    @property
    def ready(self) -> bool:
        return self._seeded and bool(self._candles)

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    # ------------------------------------------------------------ raw API
    def _fetch_ohlc(self) -> list[dict]:
        try:
            resp = self._client.get(f"{self.base_url}/OHLC", params={"pair": PAIR, "interval": INTERVAL})
            resp.raise_for_status()
            payload = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise KrakenError(f"OHLC request failed: {exc}") from exc
        if payload.get("error"):
            raise KrakenError(f"Kraken error: {payload['error']}")
        result = payload.get("result") or {}
        rows = next((v for k, v in result.items() if k != "last"), None)
        if not rows:
            raise KrakenError("Kraken OHLC response has no candle data")
        return sorted((parse_candle(r) for r in rows), key=lambda c: c["time"])

    def _fetch_ticker_spread(self) -> Optional[float]:
        try:
            resp = self._client.get(f"{self.base_url}/Ticker", params={"pair": PAIR})
            resp.raise_for_status()
            payload = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            log.warning("Kraken ticker failed: %s", exc)
            return None
        if payload.get("error"):
            log.warning("Kraken ticker error: %s", payload["error"])
            return None
        result = payload.get("result") or {}
        book = next(iter(result.values()), None)
        if not book or "a" not in book or "b" not in book:
            return None
        return round(max((float(book["a"][0]) - float(book["b"][0])) / POINT, 0.0), 1)

    # ------------------------------------------------------------ lifecycle
    def seed(self, force: bool = False) -> bool:
        """Fetch ~2.5 days of 5m history. Idempotent; returns False on failure."""
        if self._seeded and not force:
            return True
        try:
            rows = self._fetch_ohlc()
        except KrakenError as exc:
            self.last_error = str(exc)
            log.warning("Kraken seed failed: %s", exc)
            return False
        if len(rows) < 100:
            self.last_error = f"Kraken returned only {len(rows)} candles"
            log.warning("Kraken seed failed: %s", self.last_error)
            return False
        self._candles = rows[-MAX_CANDLES:]
        self._last_seen_time = rows[-1]["time"]
        # The last row is the in-progress candle; the newest closed one is before it.
        closed = [c for c in rows if c["time"] < self._last_seen_time]
        self._last_closed_time = closed[-1]["time"] if closed else 0
        self._seeded = True
        self._consecutive_failures = 0
        self.last_error = None
        log.info("Kraken seeded: %d 5m candles, last close %.2f @ %d", len(self._candles),
                 self._candles[-1]["close"], self._candles[-1]["time"])
        return True

    def poll_new(self) -> dict[str, dict]:
        """Fetch the latest candles; return the newest newly-closed 5m candle, else {}.

        A candle counts as closed once a newer candle time exists (the newest
        row is always the in-progress bucket). At most one candle closes per
        20s poll in normal operation; on a long gap only the latest close is
        returned and the feed re-seeds if it went stale.
        """
        if not self._seeded:
            return {}
        try:
            rows = self._fetch_ohlc()
        except KrakenError as exc:
            self._consecutive_failures += 1
            self.last_error = str(exc)
            log.warning("Kraken poll failed (%d in a row): %s", self._consecutive_failures, exc)
            return {}
        self._consecutive_failures = 0
        self.last_error = None
        self._merge(rows)
        if time.time() - self._last_ticker_at >= TICKER_MIN_INTERVAL:
            self._last_ticker_at = time.time()
            pts = self._fetch_ticker_spread()
            if pts is not None:
                self._spread_points = pts
        if not self._candles:
            return {}
        newest = self._candles[-1]["time"]
        if newest - self._last_seen_time > STALE_AFTER:
            log.warning("Kraken feed stale (last candle %d); re-seeding", self._last_seen_time)
            self.seed(force=True)
            return {}
        self._last_seen_time = newest
        closed = [c for c in self._candles if c["time"] < newest]
        if not closed:
            return {}
        latest_closed = closed[-1]
        if latest_closed["time"] <= self._last_closed_time:
            return {}
        self._last_closed_time = latest_closed["time"]
        return {INSTRUMENT: latest_closed}

    def _merge(self, rows: list[dict]) -> None:
        by_time = {c["time"]: c for c in self._candles}
        for c in rows:
            by_time[c["time"]] = c
        self._candles = sorted(by_time.values(), key=lambda c: c["time"])[-MAX_CANDLES:]

    # ------------------------------------------------------------ DemoFeed-style accessors
    def candles(self, instrument: str, n: int = 2500) -> list[dict]:
        if instrument != INSTRUMENT:
            raise KeyError(instrument)
        return self._candles[-n:]

    def last_price(self, instrument: str) -> float:
        if instrument != INSTRUMENT:
            raise KeyError(instrument)
        if not self._candles:
            raise KrakenError("Kraken feed has no candles yet")
        return self._candles[-1]["close"]

    def spread_points(self, instrument: str) -> float:
        if instrument != INSTRUMENT:
            raise KeyError(instrument)
        return self._spread_points


__all__ = ["KrakenFeed", "KrakenError", "parse_candle", "INSTRUMENT"]
