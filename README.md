# QUANT PILOT
**by Sumedh Kumar · SUMEDHHKUMAR.ai**

A seven-agent AI trading desk that trades a **Liquidity Sweep** (stop-hunt reversal) strategy on **XAUUSD** and **BTCUSD**, with a 3D mission-control interface. It runs in **Demo Mode** by default: a synthetic market with realistic, planted liquidity sweeps, plus paper trading. You need no broker and no API key.

> **Educational use only. Not financial advice. Trading involves risk of loss.** Nothing here promises profits. Backtests on synthetic or historical data do not predict future results.

---

## 3-command setup

```bash
python -m venv .venv && .venv\Scripts\python -m pip install -r requirements.txt   # macOS/Linux: .venv/bin/python
npm --prefix frontend install
python run.py                                                                       # or: npm run start
```

`run.py` copies `.env.example` to `.env` on the first run (Demo Mode on), installs anything missing, then starts:

| Service  | URL |
|----------|-----|
| App      | http://localhost:5173 |
| API      | http://127.0.0.1:8765/api/health (WebSocket at `/ws`) |

Press `Ctrl+C` to stop both. To restart, run `python run.py` again.

**Quick start:** press **Launch Desk**, then **Run Demo Scenario**. Watch the beams flow through the Constellation, and open **Chart** to see the sweep, the trade ladder and the "Why this trade?" checklist.

## Adding the Claude API key

1. Put your key in `.env`: `ANTHROPIC_API_KEY=sk-ant-...`. The model is set by `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`).
2. Restart with `python run.py`. The banner switches to **Analyst: Claude**.

The Analyst receives the Hunter's candidate plus compact context and must return **strict JSON**, which is validated by Pydantic (`AnalystDecision`). On invalid JSON it retries once, then falls back to `NO_TRADE`. Claude can only **refine or reject**: entry and SL are pinned to the Hunter's numbers, and targets are clamped to the candidate's range. Rate limits, timeouts and network errors show a friendly toast, and that setup is scored by the rule-based Analyst instead. Without a key, the rule-based Analyst is used throughout.

## Switching from Demo to MetaTrader 5 (Windows only)

1. Install and open **MetaTrader 5**, then log in to your **demo** account.
2. Click **Algo Trading** in the MT5 toolbar so it turns green.
3. Fill in `.env`: `MT5_LOGIN`, `MT5_PASSWORD`, `MT5_SERVER`, `MT5_PATH` (for example `C:\Program Files\MetaTrader 5\terminal64.exe`). Then restart.
4. In **Settings → Mode**, choose **MT5 live data**, then **MT5 orders**. The pill changes to **MT5 DEMO**.
5. In **Settings → MT5 symbols**, confirm your broker's names (for example `XAUUSDm` or `GOLD`). Candidates are auto-detected.
6. Use **Send test order** (Settings or Signals). It places the minimum lot on the demo account and closes it, so it appears in MT5's Trade tab and then History.

The **MT5 status card** checks the bridge every 10 seconds: terminal connected, Algo Trading, account trade permission, the configured account actually logged in, and symbol availability. Every failure shows the exact fix. If MT5 drops, the desk falls back to Demo/Paper automatically and says so.

**Order flow** (only after Guardian approval): build the request (volume normalized to min/step/max; fill mode FOK → IOC → RETURN), validate SL/TP against the stops and freeze levels, run `order_check`, then `order_send` (with one requote retry), then confirm the fill via `positions_get`. Every step is logged in the **MT5 Execution Log** with its retcode, ticket and fill price. Open positions are then managed: break-even at 1R, 50% partial close at TP1, and a trailing stop toward TP2. Positions and deals sync every 2 seconds, so manual changes in the terminal also appear in the app.

**Safety:** Orders are refused on non-DEMO accounts unless `.env` has `MT5_MODE=live` **and** you unlock Live in Settings by typing `I UNDERSTAND THE RISK`. Each `signal_id` can create at most one order, tracked in SQLite so it holds across restarts. The kill switch blocks new orders and can close every position carrying magic number `20260101`. LLM output never reaches `order_send` without passing AEGIS. The MT5 password is never logged or returned by the API.

On macOS and Linux, the MT5 Python package is unavailable. The app stays in Demo/Paper mode and shows a banner explaining why.

## Architecture

```
Scout → Cartographer → Hunter → Analyst (Claude) → Guardian (AEGIS) → Executioner → Chronicler
data    liquidity map   sweep    strict JSON        hard vetoes         paper | MT5   SQLite journal
```

Every agent implements `run(context) -> AgentResult(status, summary, data, confidence, timestamp)`. The Orchestrator runs them on each 5M close (Demo replays one candle every 3 seconds) and streams every result over the WebSocket.

```
backend/
  main.py               FastAPI REST + /ws
  config.py             .env settings (secrets never printed)
  agents/               base.py + one file per agent
  core/                 orchestrator, strategy, indicators, risk, paper_engine, mt5_client,
                        demo_data, backtest, db, models, events
frontend/src/
  components/ scenes/ views/ store/ lib/ config/social.ts
tests/                  strategy, risk, schema, MT5 bridge (mocked), optional MT5 integration
run.py                  one-command launcher
```

### Strategy rules (Hunter + AEGIS)
- **Levels:** PDH/PDL, Asian range high/low, 4H swing highs/lows, equal highs/lows (15M clusters).
- **Sweep:** the wick pierces the level by 10–25 pips (XAU) or 0.15–0.40% (BTC), coming from inside the range.
- **Displacement:** a close back inside within 3 candles, with a body ≥ 1.2× the 20-candle average (a volume spike counts as a bonus).
- **Entry / exits:** entry on the confirmation close; SL beyond the wick plus 5 pips (XAU) or 0.1% (BTC); TP1 at 1:2; TP2 at the next liquidity pool (≥ 1:3).
- **AEGIS vetoes:** spread, risk per trade (1% default, 2% maximum, automatic lot sizing), 4% daily drawdown kill, max open trades, RR ≥ 1:2, confidence ≥ 7, session filter (gold: London/NY), news-hour filter, duplicate/cooldown, kill switch.

## Tests

```bash
.venv\Scripts\python -m pytest -q           # 47 unit tests: sweep detector, risk, JSON schema, mocked MT5 bridge
set QP_MT5_INTEGRATION=1 && .venv\Scripts\python -m pytest tests/test_mt5_integration.py   # places and closes 1 min lot, DEMO accounts only
```

## How to extend

- **New agent:** subclass `backend/agents/base.Agent`, implement `_run(ctx)`, and insert it into `Services.agents` in `core/orchestrator.py`. Add its name, color and blurb to `AGENTS` in `frontend/src/lib/types.ts`. It then appears in the Constellation automatically.
- **New instrument:** add an `InstrumentSpec` in `core/indicators.py`, a demo profile in `core/demo_data.BASE`, and the symbol to `INSTRUMENTS` in `config.py`.
- **New veto:** append a `Check` in `core/risk.evaluate`. It shows up in the Guardian trace, the Journal and the "Why this trade?" card.
- **New strategy parameter:** add a field to `StrategyParams` and a slider entry in `PARAM_FIELDS` (`views/SettingsView.tsx`).
- **Social links:** edit `frontend/src/config/social.ts` only.
- **News calendar:** fill `news_hours_utc` in Settings, or feed it from a calendar API in `RiskRules`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Authorization failed` in the MT5 card | The login, password or server in `.env` is wrong, or the demo account has expired. Log in manually in MT5 (File → Login to Trade Account), then press **Reconnect**. |
| "Algo Trading is disabled" | Click the **Algo Trading** button in MT5 so it turns green. |
| Symbol not available | Choose the broker's name under **Settings → MT5 symbols**. |
| Port already in use | Change `API_PORT` in `.env` (default 8765). Vite uses 5173. |
| 3D looks slow | Turn on **Settings → Display → 2D low-power layout** (mobile and weak GPUs switch automatically). |

---
Support the creator (optional, everything stays unlocked): [YouTube](https://www.youtube.com/@sumedhhkumar?sub_confirmation=1) · [Instagram](https://www.instagram.com/sumedhhkumar.ai/)
