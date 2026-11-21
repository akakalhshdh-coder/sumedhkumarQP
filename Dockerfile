# QUANT PILOT — single-container image for Render (free tier).
# Builds the React frontend once, then serves it + the FastAPI backend
# from one uvicorn process on $PORT (see server.py).
FROM python:3.12-slim

# Node 22 for the frontend build
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm install --no-audit --no-fund

COPY . .
RUN cd frontend && npm run build

ENV DEMO_MODE=true \
    MT5_MODE=demo_only \
    DATA_SOURCE=kraken \
    PAPER_STARTING_BALANCE=10000 \
    PYTHONUNBUFFERED=1

EXPOSE 10000
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-10000}"]
