"""Shared fixtures: synthetic candle builders and a fake MetaTrader5 module."""
from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def make_candles(n: int = 120, start: int = 1_767_258_000, price: float = 2650.0, step: float = 0.3) -> list[dict]:
    """Quiet, gently oscillating 5M candles (bodies ~0.3) starting at a London-session timestamp."""
    out = []
    p = price
    for i in range(n):
        o = p
        c = p + (step if i % 2 == 0 else -step)
        out.append({"time": start + i * 300, "open": o, "high": max(o, c) + 0.1, "low": min(o, c) - 0.1, "close": c, "volume": 1000})
        p = c
    return out


class FakeMT5:
    """Minimal stand-in for the MetaTrader5 package (constants + stateful positions)."""

    TRADE_ACTION_DEAL, TRADE_ACTION_SLTP = 1, 6
    ORDER_TYPE_BUY, ORDER_TYPE_SELL = 0, 1
    POSITION_TYPE_BUY, POSITION_TYPE_SELL = 0, 1
    ORDER_FILLING_FOK, ORDER_FILLING_IOC, ORDER_FILLING_RETURN = 0, 1, 2
    ORDER_TIME_GTC = 0
    TIMEFRAME_M5 = 5

    def __init__(self, trade_mode: int = 0, send_retcode: int = 10009, check_retcode: int = 0,
                 filling_flags: int = 2, stops_level: int = 0) -> None:
        self.trade_mode = trade_mode
        self.send_retcode = send_retcode
        self.check_retcode = check_retcode
        self.filling_flags = filling_flags
        self.stops_level = stops_level
        self.sent: list[dict] = []
        self.checked: list[dict] = []
        self.positions: list[SimpleNamespace] = []
        self._ticket = 1000

    # connection
    def initialize(self, **kw):
        return True

    def shutdown(self):
        return True

    login_ok = True
    account_login = 1

    def login(self, login, password="", server=""):
        if self.login_ok:
            self.account_login = login
        return self.login_ok

    def last_error(self):
        return (1, "ok")

    def terminal_info(self):
        return SimpleNamespace(name="MetaTrader 5", company="Test", trade_allowed=True, connected=True, ping_last=42000)

    def account_info(self):
        return SimpleNamespace(login=self.account_login, name="Tester", server="Test-Demo", currency="USD", balance=10000.0, equity=10000.0,
                               margin_free=10000.0, leverage=500, trade_mode=self.trade_mode, trade_allowed=True)

    def symbol_select(self, sym, enable=True):
        return sym in ("XAUUSD", "BTCUSD")

    def symbols_get(self):
        return [SimpleNamespace(name=n) for n in ("XAUUSD", "XAUUSDm", "GOLD", "BTCUSD", "EURUSD")]

    def symbol_info(self, sym):
        return SimpleNamespace(name=sym, point=0.01, digits=2, spread=20, volume_min=0.01, volume_step=0.01, volume_max=50.0,
                               trade_stops_level=self.stops_level, trade_freeze_level=0, filling_mode=self.filling_flags,
                               trade_tick_value=1.0, trade_tick_size=0.01, trade_contract_size=100.0)

    def symbol_info_tick(self, sym):
        return SimpleNamespace(bid=2650.00, ask=2650.20, time=0)

    # trading
    def order_check(self, req):
        self.checked.append(req)
        return SimpleNamespace(retcode=self.check_retcode, comment="Done" if self.check_retcode == 0 else "Invalid stops")

    def order_send(self, req):
        self.sent.append(req)
        if self.send_retcode != 10009:
            return SimpleNamespace(retcode=self.send_retcode, price=0.0, order=0, comment="fail")
        if req["action"] == self.TRADE_ACTION_DEAL and "position" not in req:
            self._ticket += 1
            self.positions.append(SimpleNamespace(ticket=self._ticket, symbol=req["symbol"], magic=req["magic"], comment=req["comment"],
                                                  time=self._ticket, volume=req["volume"], type=req["type"], price_open=req["price"],
                                                  price_current=req["price"], sl=req.get("sl", 0), tp=req.get("tp", 0), profit=0.0))
        elif "position" in req and req["action"] == self.TRADE_ACTION_DEAL:
            for p in list(self.positions):
                if p.ticket == req["position"]:
                    p.volume = round(p.volume - req["volume"], 2)
                    if p.volume <= 0:
                        self.positions.remove(p)
        elif req["action"] == self.TRADE_ACTION_SLTP:
            for p in self.positions:
                if p.ticket == req["position"]:
                    p.sl, p.tp = req["sl"], req["tp"]
        return SimpleNamespace(retcode=10009, price=req.get("price", 0.0), order=self._ticket, comment="Request executed")

    def positions_get(self, symbol=None, ticket=None):
        out = self.positions
        if symbol:
            out = [p for p in out if p.symbol == symbol]
        if ticket:
            out = [p for p in out if p.ticket == ticket]
        return tuple(out)

    def history_deals_get(self, a, b):
        return ()


@pytest.fixture
def fake_mt5():
    return FakeMT5()


@pytest.fixture
def tmp_db(tmp_path):
    from backend.core.db import Database

    return Database(str(tmp_path / "test.db"))
