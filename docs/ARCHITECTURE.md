# Architecture

## Components

```
            ┌──────────────────────────── Browser ────────────────────────────┐
            │ React SPA (Vite)  ─ TanStack Query ─ Zustand ─ R3F 3D viewer      │
            └───────────────┬──────────────────────────────────────────────────┘
                            │ REST /api (JWT bearer)        signed file URLs
            ┌───────────────▼──────────────┐      ┌───────────────────────────┐
            │ Fastify API (backend/)       │─────▶│ Storage driver            │
            │ auth · RLS-scoped queries    │      │ local disk | S3/R2/Supabase│
            │ validation · rate limit      │      └───────────────────────────┘
            └──────┬──────────────┬────────┘
                   │ SQL          │ enqueue
            ┌──────▼─────┐  ┌─────▼─────┐      ┌───────────────────────────────┐
            │ PostgreSQL │  │  Redis    │◀────▶│ Worker (backend/src/worker.ts)│
            │ (Supabase) │  │  BullMQ   │      │ ai-generation · photogrammetry│
            └────────────┘  └───────────┘      │ model-processing · export     │
                                               └──┬──────────┬──────────┬──────┘
                                                  │          │          │
                                         Meshy/Tripo   COLMAP CLI   Blender -b / Python(trimesh)
```

## Request flow: AI generation
1. `POST /api/generations` validates settings against provider capabilities, checks credits,
   writes `generations` + `generation_jobs`, charges credits (idempotent), enqueues `ai-generation`.
2. Worker creates the provider task, polls status (or receives webhook), downloads result files
   into storage, creates `models` + `model_versions` rows, enqueues `model-processing:analyze`.
3. Analysis computes real statistics (trimesh) and stores `model_metadata`.
4. On failure the job is marked failed, the error stored, and credits refunded (idempotent).

## Request flow: photogrammetry
1. `POST /api/reconstruction` → `reconstruction_jobs` row → `photogrammetry` queue.
2. Worker runs `workers/photogrammetry/pipeline.py` which streams JSON stage events
   (`feature_extraction`, `matching`, `sparse`, `dense|cpu_fallback`, `meshing`, `texturing`, `scale`).
3. Stage events update the job row (real stage, real per-stage metrics such as registered images,
   points, mean reprojection error).
4. Result GLB → storage → model + version → analysis.

## Data ownership
Every user-owned table has `owner_id`. RLS policies (`database/migrations`) restrict rows to the
owner (or team members for team-shared projects). The API executes user requests with
`SET LOCAL ROLE vistora_app` so RLS is enforced at the database level.

## Files
Storage keys: `users/<uid>/projects/<pid>/images/<uuid>.<ext>`,
`users/<uid>/models/<mid>/v<n>/model.glb`, `users/<uid>/exports/<eid>/<name>.zip`.
