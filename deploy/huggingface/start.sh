#!/usr/bin/env bash
# Starts Redis and the VISTORA 3D API (with in-process queue workers) in one container.
# Secrets (DATABASE_URL, APP_SECRET, S3 keys) and PUBLIC_APP_URL come from the Space settings.
set -euo pipefail

: "${NODE_ENV:=production}"
: "${PORT:=7860}"
: "${AUTH_MODE:=local}"
: "${DATABASE_SSL:=no-verify}"
: "${REDIS_URL:=redis://127.0.0.1:6379}"
: "${RUN_WORKER_IN_API:=true}"
: "${WORKER_CONCURRENCY_PROCESSING:=1}"
: "${WORKER_CONCURRENCY_PHOTOGRAMMETRY:=1}"
: "${DEMO_MODE:=true}"
: "${STORAGE_DRIVER:=s3}"
: "${S3_BUCKET:=vistora}"
: "${PYTHON_BIN:=/app/workers/.venv/bin/python}"
: "${WORKERS_DIR:=/app/workers}"
: "${WORK_DIR:=/data/work}"
: "${STORAGE_LOCAL_DIR:=/data/storage}"
: "${REDIS_DIR:=/data/redis}"
export NODE_ENV PORT AUTH_MODE DATABASE_SSL REDIS_URL RUN_WORKER_IN_API WORKER_CONCURRENCY_PROCESSING \
  WORKER_CONCURRENCY_PHOTOGRAMMETRY DEMO_MODE STORAGE_DRIVER S3_BUCKET PYTHON_BIN WORKERS_DIR WORK_DIR STORAGE_LOCAL_DIR
export HOME="${HOME:-/tmp}" PYTHONDONTWRITEBYTECODE=1

missing=()
for v in DATABASE_URL APP_SECRET PUBLIC_APP_URL; do [ -n "${!v:-}" ] || missing+=("$v"); done
if [ "$STORAGE_DRIVER" = s3 ]; then
  for v in S3_ENDPOINT S3_REGION S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY; do [ -n "${!v:-}" ] || missing+=("$v"); done
fi
if [ ${#missing[@]} -gt 0 ]; then
  echo "Missing Space secrets/variables: ${missing[*]} (Settings -> Variables and secrets)" >&2
  exit 1
fi

mkdir -p "$WORK_DIR" "$STORAGE_LOCAL_DIR" "$REDIS_DIR"
# Queue state lives in memory only; the database and file storage are external.
redis-server --bind 127.0.0.1 --port 6379 --dir "$REDIS_DIR" --save "" --appendonly no \
  --maxmemory-policy noeviction --daemonize yes --logfile "$REDIS_DIR/redis.log"
for _ in $(seq 1 50); do redis-cli -h 127.0.0.1 ping >/dev/null 2>&1 && break; sleep 0.2; done

cd /app/backend
exec node dist/server.js
