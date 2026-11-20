# Deployment

## Components
| Component | Runs | Needs |
|---|---|---|
| Web (React SPA) | Vercel, Netlify, nginx (`frontend/Dockerfile`) | `VITE_AUTH_MODE`, `VITE_SUPABASE_*` (Supabase mode); `/api` routed to the API |
| API (Fastify) | Render / Railway / any container host | PostgreSQL, Redis, storage, env from `.env.example` |
| Worker (BullMQ) | Same image as API, command `node dist/worker.js` | Same as API + COLMAP, Blender 4.x, Python venv (`workers/requirements.txt`), CPU/RAM; CUDA GPU optional |
| PostgreSQL | Supabase or any Postgres 15+ | migrations run automatically on API/worker start |
| Redis | Upstash / Render / Railway / self-hosted | persistent (AOF) recommended |
| Object storage | Cloudflare R2, Supabase Storage (S3 endpoint), AWS S3 | `STORAGE_DRIVER=s3`, `S3_*` |

The worker is heavy (COLMAP + Blender). Give it ≥ 4 vCPU / 8 GB RAM; a CUDA GPU with a CUDA-built COLMAP enables
PatchMatch dense reconstruction automatically.

## Self-hosted (Docker Compose)
```bash
cp .env.example .env            # set APP_SECRET (long random), keys, storage
docker compose up --build       # web :8080, api :4000
```
The Compose file was written for this build but **could not be executed in the build environment (no Docker daemon)**;
the same steps were verified natively (see below).

## Native (verified in the build environment)
```bash
# system packages (Ubuntu 24.04)
sudo apt-get install -y postgresql redis-server colmap blender python3-numpy python3-venv
python3 -m venv workers/.venv && workers/.venv/bin/pip install -r workers/requirements.txt
npm install
cp .env.example backend/.env    # adjust DATABASE_URL etc.
npm run dev:api & npm run dev:worker & npm run dev:web
```
`python3-numpy` is required because Blender's glTF exporter imports numpy from the system Python.

## Free tier: Vercel + Render + Supabase
| Piece | Service | Notes |
|---|---|---|
| Frontend | Vercel (`vercel.json`) | env `VITE_API_BASE=https://<render-service>.onrender.com/api` |
| API + workers | Render free web service from `render.yaml` (Docker) | `RUN_WORKER_IN_API=true` (free plans have no background workers) |
| Redis | Render free Key Value (`noeviction`, internal only) | from the same blueprint |
| Database | Supabase Postgres | **Session pooler** connection string (Render has no IPv6; the direct host is IPv6-only); `DATABASE_SSL=no-verify` |
| Files | Supabase Storage, private bucket `vistora`, S3 endpoint + access keys | `STORAGE_DRIVER=s3` |

Free-tier limits: the Render service sleeps after ~15 minutes idle (first request ≈ 1 min cold start); 512 MB RAM and a fraction
of a CPU make Blender jobs slow and COLMAP photogrammetry impractical (it may run out of memory). Supabase free storage is 1 GB.
Upgrade the Render instance (or run `node dist/worker.js` on a separate machine with `RUN_WORKER_IN_API=false`) for real workloads.

## Supabase
1. Create a project. Use its Postgres connection string as `DATABASE_URL` (migrations add tables, RLS policies and the
   `vistora_app` role; `app_current_user_id()` falls back to `auth.uid()`).
2. `AUTH_MODE=supabase`, `SUPABASE_URL`, and either `SUPABASE_JWT_SECRET` (legacy HS256) or nothing (JWKS is used).
3. Frontend: `VITE_AUTH_MODE=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Enable Google in Supabase Auth to show
   "Continue with Google". Add `<web>/auth/callback` and `<web>/reset-password` to the redirect allow-list.
4. Storage: Supabase Storage S3 endpoint (`S3_ENDPOINT=https://<ref>.supabase.co/storage/v1/s3`) or Cloudflare R2.

## AI providers
Set `MESHY_API_KEY` and/or `TRIPO_API_KEY` on API **and** worker, allow egress to `api.meshy.ai` / `api.tripo3d.ai`,
optionally `PROVIDER_WEBHOOK_SECRET`. Re-check field names against current docs (see AI_PROVIDERS.md). Set `DEMO_MODE=false`
in production unless you want the labelled demo provider visible.

## Operations
* Health: `GET /api/health` (liveness), `GET /api/health/ready` (DB, Redis, storage).
* Monitoring: Settings → System status, or `GET /api/system/metrics` (worker heartbeats, queue counts).
* Recovery: the worker fails and refunds jobs interrupted by crashes (every 10 min and at start).
* Plans without a payment gateway: `npm run set-plan -w backend -- user@example.com pro`.
* Logs: structured JSON (pino) with request IDs; secrets and passwords are redacted.

## Verification commands
```bash
npm run typecheck && npm run lint
npm run test                 # backend integration (needs Postgres, Redis, Blender, COLMAP) + frontend unit
npm run e2e                  # Playwright end-to-end (starts/reuses dev servers)
npm run build
```
