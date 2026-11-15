"""Optional live integration test against a real MT5 DEMO terminal.

Runs only when QP_MT5_INTEGRATION=1 and a DEMO account is connected. It places
the minimum lot on XAUUSD, then closes it. It refuses to run on a real account.
"""
from __future__ import annotations

import os
import sys

import pytest

pytestmark = pytest.mark.skipif(
    sys.platform != "win32" or os.getenv("QP_MT5_INTEGRATION") != "1",
    reason="set QP_MT5_INTEGRATION=1 on Windows with an MT5 demo terminal running",
)


def test_place_and_close_min_lot(tmp_db):
    from backend.config import settings
    from backend.core.mt5_client import MT5Bridge

    b = MT5Bridge(tmp_db, login=settings.mt5_login, password=settings.mt5_password, server=settings.mt5_server,
                  path=settings.mt5_path, magic=settings.mt5_magic)
    assert b.connect(), "could not connect to MT5"
    h = b.health()
    if (h.get("account") or {}).get("trade_mode") != "DEMO":
        pytest.skip("connected account is not DEMO; refusing to trade")
    if not b.is_ready():
        pytest.skip(f"terminal not ready: {h['issues']}")
    res = b.send_test_order("XAUUSD", hold_seconds=2.0)
    b.shutdown()
    assert res["ok"], res["message"]
