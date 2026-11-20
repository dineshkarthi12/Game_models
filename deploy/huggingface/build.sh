#!/usr/bin/env bash
# Builds the VISTORA 3D backend inside a Hugging Face Docker Space image.
# Runs as root during `docker build`, from the cloned repository at /app.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
cd /app

apt-get update
apt-get install -y --no-install-recommends ca-certificates curl gnupg redis-server \
  python3 python3-venv python3-numpy blender colmap libgl1 libglib2.0-0
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
rm -rf /var/lib/apt/lists/*

npm ci --workspace backend --include-workspace-root=false
python3 -m venv workers/.venv
workers/.venv/bin/pip install --no-cache-dir -r workers/requirements.txt
npm run build -w backend
npm cache clean --force

# Spaces run the container as UID 1000 (the `ubuntu` user in ubuntu:24.04).
mkdir -p /data/work /data/storage /data/redis /home/ubuntu
chown 1000:1000 /home/ubuntu
chown -R 1000:1000 /data
chmod +x deploy/huggingface/start.sh
