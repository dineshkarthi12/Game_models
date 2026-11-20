# Milestone Tracker

Status legend: ⬜ Not started · 🟨 In progress · ✅ Complete (verified) · ⚠️ Complete with configuration required · ⛔ Blocked

| # | Milestone | Status | Notes |
|---|---|---|---|
| 0 | Repository audit & planning | ✅ | Plan, decisions, architecture docs written |
| 1 | Brand & design system | ✅ | Tokens, logo, primitives, layouts, style guide at /design-system |
| 2 | Landing page & authentication | ✅ | Local JWT auth verified; Supabase mode implemented, CONFIGURATION REQUIRED |
| 3 | Dashboard & projects | ✅ | Projects CRUD, library, history, folders/tags, RLS verified |
| 4 | Multi-view upload | ✅ | Upload studio, quality metrics, coverage, ORB/RANSAC overlap |
| 5 | AI provider integration | ⚠️ | Pipeline verified (BullMQ, demo, mock contracts). Real Meshy/Tripo: CONFIGURATION REQUIRED |
| 6 | Photogrammetry | ✅ | COLMAP SfM + CPU stereo + Poisson + photo-projected texture; height within ~1% of ground truth |
| 7 | 3D workspace | ⬜ | |
| 8 | Accuracy validation & refinement | ⬜ | |
| 9 | Game asset pipeline | ⬜ | |
| 10 | Professional export | ⬜ | |
| 11 | Production infrastructure | ⬜ | |
| 12 | Final QA & deployment | ⬜ | |

---

## Milestone 0 — Repository audit & planning ✅
**Implemented:** repository audit; architecture; `IMPLEMENTATION_PLAN.md`, `TECHNICAL_DECISIONS.md`,
`MILESTONE_TRACKER.md`, `docs/ARCHITECTURE.md`; external dependencies identified.
Installed native tooling (COLMAP 3.9.1 CPU, Blender 4.0.2, assimp 5.3) and the Python worker venv.
**Findings:** empty repo; no GPU; provider documentation hosts blocked from the build network; no credentials.
**Acceptance:** architecture and milestone plan documented — verified.

## Milestone 1 — Brand & design system ✅
**Implemented:** geometric V logo + favicon; Tailwind tokens for every brand colour; Inter typography;
primitives (Button, Card, Input/Select/Textarea/Checkbox, Badge/StatusBadge, Dialog, Dropdown, Tabs, Switch,
Tooltip, Segmented, StatCard, Callout, ProgressBar, Skeleton, EmptyState, PageHeader); PublicLayout,
AuthLayout, AppLayout (collapsible sidebar, mobile drawer, top bar with search/notifications/credits/profile);
procedural SVG illustrations (real flat-shaded lathe mesh, no stock renders); `/design-system` style guide.
**Files:** `frontend/` config (Vite, TS, Tailwind, ESLint), `frontend/src/components/**`, `frontend/src/layouts/**`, `styles/globals.css`.
**Tests:** `tsc -b` clean; `vite build` succeeds; Playwright screenshot of /design-system at 1440px — no console errors, no horizontal overflow.
**Known issues:** none.

## Milestone 2 — Landing page & authentication ✅
**Implemented:** Landing (hero, how it works, multi-view, photogrammetry, precision, game-ready, export, platform grid,
pricing from `/api/plans`, FAQ, CTA, footer), Features, How It Works, Pricing, Documentation (capture guide incl.
reflective/transparent/featureless objects, modes, metrics, export, API, limitations), 404.
Auth: register, login, logout, forgot/reset password (hashed single-use 1h tokens, no user enumeration),
change password, profile update, session list/revoke, account delete; protected routes with `?next=` redirect;
Google login button shown only in Supabase mode. Backend: full schema (`001_core_schema.sql`) and RLS (`002_rls_policies.sql`),
API requests run as `vistora_app` with RLS enforced.
**Tests:** backend `test/auth.test.ts` 6/6 passing (real Postgres); Playwright: unauthenticated `/app` → `/login?next=/app`,
UI registration → dashboard, no console errors; 375px mobile: no horizontal overflow on /, /docs, /pricing, /login, /register.
**Known issues / external:** Supabase Auth mode untested against a live project (no credentials) — CONFIGURATION REQUIRED.
Password-reset email uses a log transport until an email provider is configured.

## Milestone 3 — Dashboard & projects ✅
**Implemented:** storage drivers (local disk + HMAC-signed expiring URLs with Range support; S3/R2/Supabase-S3 with presigned URLs);
API: projects CRUD with search/category/status filters, sorting, pagination, project manifest export; dashboard summary;
models library list (search, category, source, favorite, folder, tag, project, date range, sort, pagination), rename, favorite,
tags, move to folder, duplicate (copies files), download (signed), delete (removes files); folders CRUD; tag cloud;
generation history with filters; storage usage recomputed from authoritative tables.
UI: Dashboard (5 live metrics, quick actions, recent projects table/grid with search/type/status filters, recent generations),
My Projects, Create 3D (mode + new/existing project), Asset Library (grid/list, folders, favorites, tags, filters, preview
dialog, full action menu), Generation History.
**Tests:** backend 10/10 (`test/projects.test.ts`: CRUD, search/filter/sort/pagination, validation, API + **database-level RLS
isolation**, app role cannot write the credit ledger, dashboard, folders). Playwright: /app, /app/projects, /app/library,
/app/history, /app/create render with live data, no overflow; one DOM nesting warning found and fixed.
**Known issues:** project detail page is delivered with Milestone 4 (depends on images API).

## Milestone 4 — Multi-view upload ✅
**Implemented:** `POST /api/uploads` (multipart, batch, per-file angle), magic-byte type verification (JPG/PNG/WEBP only,
extension/MIME ignored), size/megapixel/min-dimension limits, storage quota, per-project image cap, exact-duplicate
rejection (SHA-256), EXIF-oriented thumbnails (WebP), per-image metrics (Laplacian-variance sharpness, brightness, contrast,
exposure clipping, resolution, aspect ratio, RGB histogram, 64-bit dHash). Replace, delete, re-angle, reorder.
Dataset analysis: canonical-angle coverage (reported separately from quality), near-duplicates (dHash ≤ 4), blur/low-res lists,
lighting consistency, colour-histogram "same object" heuristic (labelled as heuristic), recommendations.
Overlap check: `workers/model-processing/overlap.py` — ORB + ratio test + RANSAC fundamental matrix, strong-pair graph,
weakly connected images, suitability for photogrammetry.
UI: Upload Studio (drag-and-drop, browse, camera capture, real byte-level progress, client-side validation, key-view slots with
drop-to-assign, all-photographs grid with drag/arrow reordering, replace/delete/full-size inspection with metrics),
Reference Coverage ring, orientation guide (top-down camera ring), quality panel, overlap panel, recommendations.
Project detail page (models / reference images / generations tabs). Missing angles never block the user.
Tool: `workers/tools/render_dataset.py` renders a synthetic multi-view dataset with known ground-truth dimensions (Blender Cycles).
**Tests:** backend 12/12 (`test/uploads.test.ts`: fake file rejected, duplicate rejected, blur and low-res detected, angles,
signed URL returns original bytes, tampered signature 403, coverage ratio, overlap inliers > 40 for overlapping crops, weak
image flagged, re-angle, reorder, replace, delete, storage accounting, cross-user isolation). Playwright: uploads through the
real file input, re-assigns angles, uploads into the Top slot, runs the overlap check; no console errors.
**Known issues:** Fastify default `maxParamLength` (100) broke signed URLs — fixed (2048).

## Milestone 5 — AI provider integration ⚠️ CONFIGURATION REQUIRED
**Implemented:** provider adapter interface; Meshy (single + multi-image ≤4, rigging, cancel), Tripo (upload tokens,
image_to_model, multiview_to_model with fixed Front/Left/Back/Right order, animate_rig), Demo (Blender procedural, labelled);
capability-driven validation (texture resolutions, PBR, topology, symmetry, texture prompt, rigging only for characters,
polycount range); BullMQ queues (`ai-generation`, `photogrammetry`, `model-processing`, `export`) and worker process;
resumable polling (no duplicate provider tasks on retry), timeouts, transient-error tolerance; cancellation (DB flag →
provider cancel); GLB download + magic check; model + version creation; analysis job (trimesh statistics, mesh integrity,
texture inventory, Blender thumbnail); atomic credit charge with generation row; exactly-once refunds; notifications;
webhook endpoint (hint-only, secret-protected); `/api/providers`, `/api/system/status`, `/api/generations/preview` (dry run:
images actually sent, cost, blocking issues). UI: Configure step (mode, provider cards with configuration status, options shown only
when supported, plan-locked qualities, images-that-will-be-sent preview, cost/balance), AI Processing page (observed stages only,
provider-reported progress with source label, event log, elapsed time without ETA, cancel, retry).
**Tests:** backend 18/18; `test/generations.test.ts` (6) runs real BullMQ workers on Redis: demo generation → stored, analysed,
thumbnail; Meshy contract (≤4 images, data URIs, PBR flag, polling, GLB download, 15 credits charged); Tripo multiview order +
failure → refunded exactly once (duplicate failure path does not double-refund); cancel → provider DELETE + refund;
plan/capability/credit/configuration checks (403/400/402/503) and no orphan generation on 402.
Playwright: configure → generate (demo) → job page → succeeded; one 400 (empty project id query) found and fixed;
stage display corrected to show unobserved stages as "not reported" instead of completed.
**Acceptance:** "At least one configured provider successfully generates and retrieves a genuine model" — **NOT MET in this
environment**: no Meshy/Tripo API keys, and both API hosts are blocked by the sandbox network policy. Action: set
`MESHY_API_KEY` and/or `TRIPO_API_KEY`, allow `api.meshy.ai` / `api.tripo3d.ai`, re-verify field names (docs/AI_PROVIDERS.md),
run one generation per provider.

## Milestone 6 — Photogrammetry ✅
**Implemented:** `workers/photogrammetry/pipeline.py` (COLMAP SfM, undistortion, GPU PatchMatch path, CPU SGBM dense fallback
with left-right check and multi-pair voxel fusion, gravity/front orientation, RANSAC support-plane removal, screened Poisson
meshing with support trimming, decimation, Blender UV unwrap, photo-projection texturing with depth-buffer occlusion,
known-dimension scale calibration, point-cloud GLB + camera poses + log outputs); `colmap_io.py`, `texture.py`, `unwrap.py`;
Node processor with live stage/metric mirroring, process-group cancellation, 2-hour limit, log upload, model/version creation;
`POST/GET /api/reconstruction`, `/cancel`, list endpoint; Precision Studio page (engine status, capture requirements incl.
reflective/transparent/featureless guidance, reconstruction history with registered images, reprojection error, dense mode, scale);
Configure step photogrammetry options (matcher, known dimension); job page photogrammetry metrics; dataset renderer with ground truth.
**Tests:** `test/photogrammetry.test.ts` 3/3 — real reconstruction through API + BullMQ (registration ≥ 90%, reprojection
< 1.5 px, textured, calibrated, **height deviation 0.84% vs ground truth**); non-overlapping photos fail with a clear message
+ refund + stored log; cancellation kills the Python/COLMAP process group and refunds. Playwright: 41 photos → overlap check →
configure with known dimension → reconstruction (41/41 registered, 0.468 px, 2m29s) → job page; no console errors.
**Known issues / decisions:** COLMAP 3.9.1 sparse Delaunay mesher hangs (not used); Blender 4.0.2 Cycles bake outputs black
(replaced by Python projection texturing); CPU dense is lower detail than GPU. See docs/PHOTOGRAMMETRY.md.
