# Vistora 3D — Implementation Plan

> "From Every Angle to Every Detail."

## 1. Repository audit (Milestone 0)

| Item | Finding (2026-11-20) |
|---|---|
| Existing code | None — empty repository, no commits. Greenfield build. |
| Runtime | Node 22, npm 10, pnpm 10, Python 3.13 |
| Services available locally | PostgreSQL 16, Redis 7, Docker CLI |
| Native 3D tooling (installed via apt) | COLMAP 3.9.1 (**CPU build, no CUDA**), Blender 4.0.2 (headless), assimp 5.3 |
| GPU | None. COLMAP dense MVS (`patch_match_stereo`) requires CUDA and is unavailable here. |
| External network | `docs.meshy.ai` and `platform.tripo3d.ai` were **not reachable** from the build environment (DNS blocked). No Meshy/Tripo API keys provided. |
| Supabase / R2 | No project credentials provided. |

## 2. Architecture summary

```
frontend/        React + Vite + TS + Tailwind + shadcn-style UI + R3F viewer
backend/         Fastify (TS) REST API  +  BullMQ worker process (same codebase)
  src/routes        HTTP routes (auth, projects, uploads, generations, reconstruction, models, exports, ...)
  src/services      Business logic (credits, projects, analysis, validation ...)
  src/providers     AI provider adapters (Meshy, Tripo, Demo)
  src/reconstruction COLMAP pipeline orchestration
  src/jobs          BullMQ queues + processors
  src/storage       Storage drivers (local disk, S3-compatible: R2 / Supabase S3)
  src/database      pg pool, migrations runner, RLS-scoped query helper
  src/auth          Auth providers (local JWT, Supabase JWT)
workers/         Native processing scripts invoked by the BullMQ worker
  photogrammetry/   COLMAP driver, vertex-colour projection texturing, scale calibration
  model-processing/ trimesh-based analysis/validation, silhouette comparison
  export-processing/ Blender headless scripts: refine, optimise, LOD, export, packaging
database/migrations  Plain SQL, Supabase-compatible, with RLS policies
docs/            ARCHITECTURE, API, AI_PROVIDERS, PHOTOGRAMMETRY, EXPORTS, DEPLOYMENT
```

See `docs/ARCHITECTURE.md` for details and `TECHNICAL_DECISIONS.md` for rationale.

## 3. Milestones

| # | Milestone | Key deliverables |
|---|---|---|
| 0 | Repository audit & planning | This plan, tracker, technical decisions, architecture docs |
| 1 | Brand & design system | Logo, tokens, Tailwind theme, UI primitives, layouts |
| 2 | Landing page & auth | Public pages, login/register/forgot/reset, protected routes, local + Supabase auth |
| 3 | Dashboard & projects | Dashboard metrics, projects CRUD, asset library, history, search/filter/sort/paginate |
| 4 | Multi-view upload | Uploads, angle assignment, per-image quality metrics, set analysis, coverage |
| 5 | AI provider integration | Meshy + Tripo adapters, BullMQ jobs, polling, retrieval, demo mode |
| 6 | Photogrammetry | COLMAP SfM pipeline, CPU meshing fallback, texturing, scale calibration |
| 7 | 3D workspace | R3F viewer, wireframe/textures/materials/UV/skeleton/animation, statistics |
| 8 | Validation & refinement | Geometry checks, silhouette comparison, dimension checks, reports, refinement ops, versions |
| 9 | Game asset pipeline | Decimation, voxel remesh, UV unwrap, LODs, collision mesh, presets, game-ready validation |
| 10 | Professional export | Blender export to FBX/GLB/GLTF/OBJ/USD/USDZ/STL, presets, ZIP packaging, re-import validation |
| 11 | Production infrastructure | RLS, quotas, credits ledger/refunds, logging, rate limiting, error recovery |
| 12 | Final QA & deployment | Unit/integration/browser tests, responsive checks, docker-compose, deployment docs |

## 4. External dependencies

| Dependency | Needed for | Status |
|---|---|---|
| Meshy API key (`MESHY_API_KEY`) | AI reconstruction | CONFIGURATION REQUIRED |
| Tripo API key (`TRIPO_API_KEY`) | AI reconstruction, rigging | CONFIGURATION REQUIRED |
| Supabase project (`SUPABASE_URL`, keys, JWT secret) | Hosted auth/DB/storage | Optional — local auth/Postgres/disk used otherwise |
| Cloudflare R2 / S3 credentials | Object storage in production | Optional — local disk driver otherwise |
| CUDA GPU | COLMAP dense MVS | Optional — CPU sparse-Delaunay fallback otherwise |
| Payment gateway | Paid plans | Not activated (no credentials) |
