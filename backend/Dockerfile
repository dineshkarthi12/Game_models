# API + worker image. The same image runs `node dist/server.js` (API) or `node dist/worker.js` (worker).
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
      python3 python3-venv python3-numpy blender colmap libgl1 libglib2.0-0 \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace backend --include-workspace-root=false
COPY workers/requirements.txt workers/
RUN python3 -m venv workers/.venv && workers/.venv/bin/pip install --no-cache-dir -r workers/requirements.txt
COPY database database
COPY workers workers
COPY backend backend
RUN npm run build -w backend
ENV NODE_ENV=production PORT=4000 PYTHON_BIN=/app/workers/.venv/bin/python WORKERS_DIR=/app/workers \
    STORAGE_LOCAL_DIR=/data/storage WORK_DIR=/data/work
WORKDIR /app/backend
EXPOSE 4000
CMD ["node", "dist/server.js"]
