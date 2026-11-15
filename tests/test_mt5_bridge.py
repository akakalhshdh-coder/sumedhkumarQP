"""MT5 bridge tests with a mocked MetaTrader5 module: sizing, stops, retcodes, idempotency, safety."""
from __future__ import annotations

from types import SimpleNamespace

from backend.core.mt5_client import MT5Bridge, retcode_message

from .conftest import FakeMT5


def _bridge(db, mt5: FakeMT5, **kw) -> MT5Bridge:
    b = MT5Bridge(db, login=1, password="secret", server="Test-Demo", path="", magic=20260101, mt5_module=mt5, **kw)
    b.connect()
    b.health()
    return b


def _order(b: MT5Bridge, sid: str = "sig-1", direction: str = "LONG", sl: float = 2648.0, tp1: float = 2654.0, tp2: float = 2656.0, vol: float = 0.337):
    return b.place_order(signal_id=sid, instrument="XAUUSD", direction=direction, volume=vol, sl=sl, tp1=tp1, tp2=tp2, cooldown_s=0)


def test_health_reports_account_and_ping(tmp_db):
    b = _bridge(tmp_db, FakeMT5())
    h = b.last_health
    assert h["connected"] and h["account"]["trade_mode"] == "DEMO" and h["ping_ms"] == 42.0
    assert "password" not in str(h).lower()
    assert b.is_ready()


def test_places_order_with_normalized_volume_sl_tp_and_magic(tmp_db):
    mt5 = FakeMT5()
    b = _bridge(tmp_db, mt5)
    res = _order(b)
    assert res.ok, res.message
    req = mt5.sent[-1]
    assert req["volume"] == 0.33 and req["sl"] == 2648.0 and req["tp"] == 2656.0
    assert req["magic"] == 20260101 and req["comment"].startswith("QuantPilot|sig-1")
    assert req["type_filling"] == FakeMT5.ORDER_FILLING_IOC  # flags=2 -> IOC first
    assert res.ticket == mt5.positions[0].ticket
    assert mt5.checked, "order_check must run before order_send"


def test_idempotency_same_signal_never_double_places(tmp_db):
    mt5 = FakeMT5()
    b = _bridge(tmp_db, mt5)
    assert _order(b).ok
    second = _order(b)
    assert not second.ok and second.duplicate
    assert len([r for r in mt5.sent if "position" not in r]) == 1
    # a fresh bridge on the same DB (simulated restart) must also refuse
    b2 = _bridge(tmp_db, mt5)
    assert _order(b2).duplicate


def test_invalid_stops_rejected_before_send(tmp_db):
    mt5 = FakeMT5()
    b = _bridge(tmp_db, mt5)
    res = _order(b, sl=2651.0)  # SL above buy price
    assert not res.ok and "below the buy price" in res.message
    assert mt5.sent == []


def test_stops_level_enforced(tmp_db):
    mt5 = FakeMT5(stops_level=500)  # 5.00 minimum distance
    b = _bridge(tmp_db, mt5)
    res = _order(b, sl=2648.0)
    assert not res.ok and "broker minimum" in res.message


def test_order_check_failure_blocks_send(tmp_db):
    mt5 = FakeMT5(check_retcode=10016)
    b = _bridge(tmp_db, mt5)
    res = _order(b)
    assert not res.ok and mt5.sent == []


def test_retcode_handling_human_messages(tmp_db):
    mt5 = FakeMT5(send_retcode=10019)
    b = _bridge(tmp_db, mt5)
    res = _order(b)
    assert not res.ok and res.retcode == 10019 and "Not enough money" in res.message
    assert "Market is closed" in retcode_message(10018)
    assert "Algo Trading" in retcode_message(10027)


def test_real_account_refused_without_live_unlock(tmp_db):
    mt5 = FakeMT5(trade_mode=2)
    b = _bridge(tmp_db, mt5)
    res = _order(b)
    assert not res.ok and "DEMO ACCOUNT ONLY" in res.message and mt5.sent == []
    b.live_unlocked = True  # toggle alone is not enough without MT5_MODE=live
    assert not _order(b, sid="sig-2").ok
    b2 = _bridge(tmp_db, mt5, allow_live_env=True)
    b2.live_unlocked = True
    assert _order(b2, sid="sig-3").ok


def test_manage_breakeven_partial_and_trailing(tmp_db):
    mt5 = FakeMT5()
    b = _bridge(tmp_db, mt5)
    res = _order(b, vol=0.5)
    pos = mt5.positions[0]
    entry = b.meta[str(res.ticket)]["entry"]
    r = entry - 2648.0
    pos.price_current = entry + r + 0.1  # beyond 1R
    b.manage_positions()
    assert pos.sl == round(entry, 5)
    pos.price_current = 2654.5  # beyond TP1
    ev = b.manage_positions()
    assert any(e["type"] == "tp1" for e in ev)
    assert pos.volume == 0.25


def test_symbol_detection_and_mapping(tmp_db):
    b = _bridge(tmp_db, FakeMT5())
    c = b.detect_symbols()
    assert "XAUUSD" in c["XAUUSD"] and "GOLD" in c["XAUUSD"] and c["BTCUSD"] == ["BTCUSD"]
    b.set_symbol_map({"XAUUSD": "XAUUSDm"})
    assert b.sym("XAUUSD") == "XAUUSDm"
    assert any(i["code"] == "symbol_XAUUSD" for i in b.health()["issues"])


def test_algo_trading_disabled_is_reported(tmp_db):
    mt5 = FakeMT5()
    mt5.terminal_info = lambda: SimpleNamespace(name="MT5", company="x", trade_allowed=False, connected=True, ping_last=0)
    b = _bridge(tmp_db, mt5)
    assert any(i["code"] == "algo" for i in b.last_health["issues"]) and not b.is_ready()


def test_wrong_account_blocks_orders(tmp_db):
    mt5 = FakeMT5()
    mt5.account_login = 999  # terminal logged in to a different account
    mt5.login_ok = False  # configured credentials rejected
    b = _bridge(tmp_db, mt5)
    codes = [i["code"] for i in b.last_health["issues"]]
    assert "account_mismatch" in codes and not b.is_ready()
    assert "secret" not in str(b.last_health)


def test_unavailable_module(tmp_db):
    b = MT5Bridge(tmp_db, login=0, password="", server="", path="", magic=1)
    b.mt5 = None
    assert not b.connect()
    assert b.health()["issues"][0]["code"] == "unavailable"
