"""One-command launcher for QUANT PILOT: `python run.py`

* creates .env from .env.example on first run (Demo Mode on)
* installs Python deps into .venv and npm deps if missing
* starts the FastAPI backend and the Vite frontend, waits until both respond
* Ctrl+C stops both
"""
from __future__ import annotations

import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FRONTEND = ROOT / "frontend"
VENV = ROOT / ".venv"
PY = VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
NPM = "npm.cmd" if os.name == "nt" else "npm"


def env_port() -> int:
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("API_PORT="):
            return int(line.split("=", 1)[1].split("#")[0].strip())
    return 8765


def ensure_setup() -> None:
    if not (ROOT / ".env").exists():
        shutil.copy(ROOT / ".env.example", ROOT / ".env")
        print("• Created .env from .env.example (Demo Mode on)")
    if not PY.exists():
        print("• Creating Python virtualenv…")
        subprocess.check_call([sys.executable, "-m", "venv", str(VENV)])
        subprocess.check_call([str(PY), "-m", "pip", "install", "-q", "-r", str(ROOT / "requirements.txt")])
    if not (FRONTEND / "node_modules").exists():
        print("• Installing frontend packages (first run)…")
        subprocess.check_call([NPM, "install", "--no-audit", "--no-fund"], cwd=FRONTEND)


def wait_for(url: str, timeout: float = 90) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        try:
            with urllib.request.urlopen(url, timeout=2) as r:
                if r.status < 500:
                    return True
        except Exception:  # noqa: BLE001 - still booting
            time.sleep(0.8)
    return False


def main() -> int:
    ensure_setup()
    port = env_port()
    env = {**os.environ, "QP_API": f"http://127.0.0.1:{port}", "PYTHONUNBUFFERED": "1"}
    backend = subprocess.Popen([str(PY), "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", str(port)], cwd=ROOT, env=env)
    frontend = subprocess.Popen([NPM, "run", "dev", "--", "--host", "127.0.0.1"], cwd=FRONTEND, env=env)
    ok_api = wait_for(f"http://127.0.0.1:{port}/api/health")
    ok_web = wait_for("http://127.0.0.1:5173/")
    print("\n" + "=" * 64)
    print("  QUANT PILOT  ·  by Sumedh Kumar · SUMEDHHKUMAR.ai")
    print("=" * 64)
    print(f"  App      : http://localhost:5173        {'OK' if ok_web else 'NOT RESPONDING'}")
    print(f"  API      : http://127.0.0.1:{port}/api/health   {'OK' if ok_api else 'NOT RESPONDING'}")
    print("  Restart  : python run.py   (or: npm run start)")
    print("-" * 64)
    print("  Quick start")
    print("  1. Open http://localhost:5173 and press Launch Desk")
    print("  2. Click 'Run Demo Scenario' to watch a full liquidity sweep")
    print("  3. Click any agent orb in the Constellation to inspect it")
    print("  4. Settings: tune AEGIS rules; connect MT5 (Windows) for demo orders")
    print("  5. Add ANTHROPIC_API_KEY to .env to let Claude run the Analyst")
    print("-" * 64)
    print("  Educational use only. Not financial advice. Trading involves risk of loss.")
    print("=" * 64 + "\n")
    try:
        while backend.poll() is None and frontend.poll() is None:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        for p in (frontend, backend):
            if p.poll() is None:
                if os.name == "nt":
                    subprocess.call(["taskkill", "/F", "/T", "/PID", str(p.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                else:
                    p.send_signal(signal.SIGINT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
