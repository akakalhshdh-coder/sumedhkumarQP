"""AEGIS risk calculation tests: lot sizing, normalization and every veto."""
from __future__ import annotations

from backend.core.indicators import SPECS
from backend.core.paper_engine import PaperEngine
from backend.core.risk import GuardianState, RiskRules, evaluate, lot_size, normalize_volume


def _eval(**over):
    base = dict(instrument="XAUUSD", direction="SHORT", entry=2650.0, stop=2652.0, tp1=2646.0, confidence=8,
                session="LONDON", spread_points=20, equity=10000.0, open_trades=0, signal_id="s1", level_key="XAUUSD:PDH",
                candle_hour_utc=9, analyst_bias="BEARISH_SWEEP_SHORT", now=1000.0)
    base.update(over)
    rules = base.pop("rules", RiskRules())
    state = base.pop("state", GuardianState(day_start_equity=10000.0))
    checks, vol, risk = evaluate(rules, state, **base)
    return {c.name: c for c in checks}, vol, risk


def test_lot_size_gold_one_percent():
    # $2 stop on gold = $200/lot; 1% of 10k = $100 -> 0.5 lots
    vol, risk = lot_size(10000, 1.0, 2650.0, 2652.0, SPECS["XAUUSD"])
    assert vol == 0.5 and risk == 100.0


def test_lot_size_uses_tick_value_when_given():
    vol, _ = lot_size(10000, 1.0, 2650.0, 2652.0, SPECS["XAUUSD"], tick_value=1.0, tick_size=0.01)
    assert vol == 0.5


def test_normalize_volume_floors_to_step_and_clamps():
    assert normalize_volume(0.337, 0.01, 0.01, 50) == 0.33
    assert normalize_volume(0.005, 0.01, 0.01, 50) == 0.0
    assert normalize_volume(99, 0.01, 0.01, 50) == 50
    assert normalize_volume(1.27, 0.1, 0.1, 100) == 1.2


def test_all_checks_pass():
    checks, vol, _ = _eval()
    assert all(c.passed for c in checks.values()), {k: c.detail for k, c in checks.items() if not c.passed}
    assert vol == 0.5


def test_spread_veto():
    checks, _, _ = _eval(spread_points=40)
    assert not checks["Spread"].passed


def test_daily_drawdown_kill():
    checks, _, _ = _eval(equity=9550.0)  # 4.5% down
    assert not checks["Daily drawdown"].passed


def test_min_rr_and_confidence():
    checks, _, _ = _eval(tp1=2648.0)  # 1:1
    assert not checks["Risk:Reward"].passed
    checks, _, _ = _eval(confidence=6)
    assert not checks["Confidence"].passed


def test_session_filter_gold_only():
    checks, _, _ = _eval(session="ASIAN")
    assert not checks["Session"].passed
    checks, _, _ = _eval(instrument="BTCUSD", session="ASIAN", entry=100000, stop=100300, tp1=99400, spread_points=1500)
    assert checks["Session"].passed


def test_max_open_trades_and_kill_switch():
    checks, _, _ = _eval(open_trades=2)
    assert not checks["Max open trades"].passed
    checks, _, _ = _eval(state=GuardianState(kill_switch=True, day_start_equity=10000))
    assert not checks["Kill switch"].passed


def test_duplicate_and_cooldown():
    st = GuardianState(day_start_equity=10000, processed_ids={"s1"})
    checks, _, _ = _eval(state=st)
    assert not checks["Duplicate / cooldown"].passed
    st = GuardianState(day_start_equity=10000, recent_signals={"XAUUSD:PDH": 900.0})
    checks, _, _ = _eval(state=st, signal_id="s2")
    assert not checks["Duplicate / cooldown"].passed


def test_no_trade_bias_vetoed():
    checks, _, _ = _eval(analyst_bias="NO_TRADE")
    assert not checks["Analyst bias"].passed


def test_rules_validation():
    r = RiskRules()
    assert r.validate({"risk_per_trade_pct": 5}) != []
    assert r.validate({"max_risk_per_trade_pct": 3}) != []
    assert r.update({"risk_per_trade_pct": 0.5}) == [] and r.risk_per_trade_pct == 0.5


def test_paper_engine_breakeven_partial_and_tp2():
    eng = PaperEngine(10000)
    pos = eng.open(signal_id="x", instrument="XAUUSD", direction="LONG", volume=0.5, price=2650.0, sl=2648.0, tp1=2654.0, tp2=2656.0)
    ev = eng.on_candle("XAUUSD", {"time": 1, "open": 2650, "high": 2652.5, "low": 2649.5, "close": 2652})
    assert [e["type"] for e in ev] == ["be"] and eng.positions[pos.id].stop_loss == 2650.0
    ev = eng.on_candle("XAUUSD", {"time": 2, "open": 2652, "high": 2654.2, "low": 2651.5, "close": 2654})
    assert "tp1" in [e["type"] for e in ev] and eng.positions[pos.id].volume == 0.25
    ev = eng.on_candle("XAUUSD", {"time": 3, "open": 2654, "high": 2656.5, "low": 2653.5, "close": 2656})
    assert ev[-1]["type"] == "tp2" and not eng.positions
    # 0.25 lots * $4 * 100 + 0.25 * $6 * 100 = 100 + 150
    assert round(eng.balance - 10000, 2) == 250.0


def test_paper_engine_stop_loss():
    eng = PaperEngine(10000)
    eng.open(signal_id="y", instrument="XAUUSD", direction="SHORT", volume=0.5, price=2650.0, sl=2652.0, tp1=2646.0, tp2=2644.0)
    ev = eng.on_candle("XAUUSD", {"time": 1, "open": 2650, "high": 2652.5, "low": 2649, "close": 2652.2})
    assert ev[0]["type"] == "sl" and round(eng.balance, 2) == 9900.0
