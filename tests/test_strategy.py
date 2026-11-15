"""Sweep detector and liquidity mapper tests."""
from __future__ import annotations

from backend.core.demo_data import DemoMarket
from backend.core.indicators import session_for, to_frame
from backend.core.models import LiquidityLevel
from backend.core.strategy import StrategyParams, depth_in_units, detect_at, map_liquidity

from .conftest import make_candles

LEVEL = 2652.0


def _with_sweep(depth: float = 1.5, body: float = 1.6, close_inside: bool = True) -> list[dict]:
    """Quiet market below 2652, then a wick through the level and a bearish displacement candle."""
    c = make_candles(100, price=2650.0)
    t = c[-1]["time"]
    last = c[-1]["close"]
    sweep_close = LEVEL - 0.2
    c.append({"time": t + 300, "open": last, "high": LEVEL + depth, "low": last - 0.1, "close": sweep_close, "volume": 2500})
    disp_close = (sweep_close - body) if close_inside else LEVEL + 0.5
    c.append({"time": t + 600, "open": sweep_close, "high": sweep_close + 0.1, "low": disp_close - 0.1, "close": disp_close, "volume": 3000})
    return c


def _level() -> list[LiquidityLevel]:
    return [LiquidityLevel(name="EQH", price=LEVEL, side="high", strength=2),
            LiquidityLevel(name="PDL", price=2630.0, side="low", strength=2)]


def test_detects_bearish_sweep_with_exact_numbers():
    df = to_frame(_with_sweep(depth=1.5))
    setups = detect_at(df, len(df) - 1, _level(), "XAUUSD")
    assert len(setups) == 1
    s = setups[0]
    assert s.direction == "SHORT"
    assert abs(s.extension_depth - 15.0) < 1e-6  # 1.5 / 0.1 pip
    assert s.stop_loss == round(LEVEL + 1.5 + 0.5, 2)  # wick + 5 pip buffer
    risk = s.stop_loss - s.entry_price
    assert abs((s.entry_price - s.take_profit_1) / risk - 2.0) < 1e-6
    assert s.displacement_ratio >= 1.2
    assert s.take_profit_2 < s.take_profit_1


def test_rejects_sweep_too_shallow_or_too_deep():
    for depth in (0.5, 3.5):  # 5 pips, 35 pips
        df = to_frame(_with_sweep(depth=depth))
        assert detect_at(df, len(df) - 1, _level(), "XAUUSD") == []


def test_rejects_weak_displacement():
    df = to_frame(_with_sweep(body=0.2))
    assert detect_at(df, len(df) - 1, _level(), "XAUUSD") == []


def test_rejects_when_no_close_back_inside():
    df = to_frame(_with_sweep(close_inside=False))
    assert detect_at(df, len(df) - 1, _level(), "XAUUSD") == []


def test_displacement_param_is_respected():
    df = to_frame(_with_sweep(body=1.6))
    strict = StrategyParams(displacement_mult=50.0)
    assert detect_at(df, len(df) - 1, _level(), "XAUUSD", strict) == []


def test_btc_depth_in_percent():
    d, unit = depth_in_units("BTCUSD", 100000.0, 100250.0)
    assert unit == "pct" and abs(d - 0.25) < 1e-9


def test_sessions():
    assert session_for(0) == "ASIAN"  # 00:00 UTC
    assert session_for(8 * 3600) == "LONDON"
    assert session_for(14 * 3600) == "NEW_YORK"
    assert session_for(22 * 3600) == "OFF_HOURS"


def test_demo_market_produces_detectable_sweeps():
    m = DemoMarket("XAUUSD", seed=3, history_days=12, max_candles=10000)
    df = to_frame(m.candles)
    found = 0
    levels = []
    for i in range(300, len(df)):
        if i % 24 == 0 or not levels:
            levels = map_liquidity(df.iloc[max(0, i - 600): i - 3], "XAUUSD")
        found += len(detect_at(df, i, levels, "XAUUSD"))
    assert found >= 4


def test_cartographer_maps_pdh_pdl_and_asia():
    m = DemoMarket("BTCUSD", seed=5, history_days=4, max_candles=5000)
    levels = map_liquidity(to_frame(m.candles), "BTCUSD")
    names = "+".join(lv.name for lv in levels)
    assert "PDH" in names and "PDL" in names
    assert any(lv.side == "high" for lv in levels) and any(lv.side == "low" for lv in levels)
