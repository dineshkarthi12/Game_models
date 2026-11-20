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
| 7 | 3D workspace | ✅ | R3F viewer on real GLBs: modes, views, stats, textures, UVs, point cloud, cameras, compare |
| 8 | Accuracy validation & refinement | ✅ | Measured validation report; Blender refinement with texture transfer; versioning |
| 9 | Game asset pipeline | ✅ | Presets, LOD chain, baked normal maps, collision, readiness gate |
| 10 | Professional export | ✅ | FBX/GLB/GLTF/OBJ/USD/USDZ/STL, presets, re-import validation, ZIP |
| 11 | Production infrastructure | ✅ | Teams + RLS sharing, ledger/plans, recovery reaper, monitoring, readiness |
| 12 | Final QA & deployment | ✅ | 29 backend + 6 unit + 5 e2e passing; builds; Docker/Compose written (not run: no daemon) |

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

## Milestone 7 — 3D workspace ✅
**Implemented:** API: `GET /api/models/:id/versions`, `GET /api/models/:id/metadata` (measured stats + integrity + textures +
source/reconstruction artefacts with signed point-cloud/camera/log URLs), `PUT /api/models/:id/current-version` (restore),
`DELETE /api/models/:id/versions/:vid`. Viewer (`frontend/src/viewer`): React Three Fiber + drei, GLTFLoader with real byte
progress and error boundary, orbit/zoom/pan, reset, fullscreen, screenshot, auto-rotate, turntable, grid, background and lighting
presets, Front/Back/Left/Right/Top/Bottom views fitted to the bounding sphere; display modes shaded / wireframe overlay / clay /
normals / UV checker; skeleton helper; animation mixer; dense point cloud and COLMAP camera frustums; synchronised side-by-side
Compare of any two versions. Workspace page tabs: 3D Preview, Wireframe, Textures (map previews + resolution), Materials (live
colour/roughness/metallic preview), UV Maps (UV layout over texture), Geometry (measured integrity + reconstruction toggles), LOD,
Skeleton, Animation, Compare; Model Info (statistics, attributes, source metrics, processing log) and Versions (view, restore, delete).
Demo models carry a permanent warning. Responsive: right panel collapses below the viewer under 1536px.
**Tests:** Playwright with SwiftShader WebGL on the real photogrammetry model: preview, wireframe, UV, geometry (+point cloud,
cameras), textures — no console errors. Bugs found & fixed: duplicate `@types/three` (npm override), UV canvas freeze (single huge
path → batched strokes + cap), hidden duplicate panel rendering, black override materials on meshes without normals; pipeline now
exports vertex normals.

## Milestone 8 — Accuracy validation & refinement ✅
**Implemented:** `workers/model-processing/validate.py` — geometry (non-manifold, holes/boundary loops, continuity, normal
consistency, degenerate/duplicate), texture (exact UV coverage/overlap by point-in-triangle sampling, out-of-range, area
distortion; map inventory; photo coverage), reference comparison (GrabCut silhouettes vs. model: true COLMAP-pose projection for
photogrammetry, bbox-normalised orthographic for others; missing-geometry ratio), dimensions (calibration state; absolute deviation
vs. user measurements, proportional comparison when uncalibrated), photogrammetry (registration, reprojection error, density),
AI (reference consistency); separate summary metrics (Reference Coverage, Reconstruction Confidence, Geometric Deviation,
Texture Quality, Model Integrity); limitations; no overall accuracy score. `refine.py` (Blender): cleanup, fill holes, voxel
retopology, Laplacian smoothing, quadric decimation, normal correction, scale correction, place on ground, material edit,
UV unwrap (+ island packing), triangulate; `transfer_texture.py` re-projects textures after topology/UV changes;
`enhance_texture.py` (unsharp mask + autocontrast). API: `POST /models/:id/validate`, `GET /models/:id/quality-report`,
`POST /models/:id/refine`, `GET /models/:id/jobs`, `GET /processing-jobs/:id`. Versions are immutable with parent links;
restore and delete (not current). UI: Validation tab (measurements, summary, grouped checks with method, limitations);
Refinement Studio (tools with parameters, synchronised before/after, stats diff, revert, regenerate).
**Measured on the reconstructed scan:** v1 validation — calibrated deviation 0.99%, 41/41 registered, 0.47 px; after
retopology refinement — watertight, 0 non-manifold, 0 holes, 79,979→20,000 triangles, deviation 1.35%.
**Tests:** `test/processing.test.ts` 2/2 (validation checks + proportional dims + demo limitation + no accuracy score;
refinement → v2 with parent link, triangle reduction, op results, current version, delete/restore rules, cross-user 404).
Playwright: refine (retopology + decimate + texture) and validate with measurements — no console errors.
**Fixed during milestone:** UV overlap metric (edge double counting), zod discriminated union with refined member,
voxel remesh of open scans (fill holes first), UV packing efficiency (10% → 17%).

## Milestone 9 — Game asset pipeline ✅
**Implemented:** engine presets (Unreal hero/prop, Unity, Godot, Mobile/VR) with triangle budgets, texture sizes, LOD ratios,
collision type; `POST /api/models/:id/optimize`, `GET /api/game-presets`. Pipeline: cleanup → optional retopology (fill holes +
voxel remesh) → normal-preserving quadric decimation (pymeshlab, no flipped faces) → fresh UV unwrap + island packing → texture
re-projection from the high-poly → **high-to-low tangent-space normal-map bake** (`bake_normals.py`, self-check flat ≈ 0.98) →
LOD1…n each with own UVs/texture/normal map → collision mesh (`collision.py`: convex hull ≤128 tris or oriented box) →
`game_check.py` (critical: budget, UVs, non-overlapping UVs, normals, power-of-two textures ≤ max; advisory: PBR maps,
manifold, scale, materials, LODs, collision) → `models.game_ready` only when every critical check passes.
Rigging integration: skeleton/animation status from measured stats; for AI character models, "Request rigging" regenerates with
the provider's rigging enabled; otherwise an honest explanation. UI: Game Asset Optimization page (presets, budget, texture, LODs,
collision, normal map, retopology; LOD chain viewer; readiness checks).
**Tests:** `test/processing.test.ts` now 3/3 (adds: LOD chain, normal map present, budget pass, collision, current = LOD0,
game_ready flag; invalid texture size → 400). Playwright on the scan: Unreal prop preset → LOD0 8,000 / LOD1 4,000 / LOD2
2,000 tris, all critical checks pass, 47 s.
**Found & fixed:** Blender edge-collapse produced flipped faces/black speckles on aggressive reduction → replaced by pymeshlab with
normal preservation + mandatory re-unwrap; atlas background filled with median colour instead of black.
**Not implemented (stated in UI):** ambient-occlusion baking; skin-weight editing (rigging is provider-side only).

## Milestone 10 — Professional export ✅
**Implemented:** `workers/export-processing/export.py` (Blender: FBX, GLB, GLTF, OBJ, STL; scale, units, axes, texture cap,
triangulation, include toggles, LOD files, Unreal UCX_ collision in FBX / separate collision elsewhere, textures written to
`Textures/` and referenced relatively), `usd_export.py` (Pixar usd-core: USD/USDZ with UsdPreviewSurface, normal map, units,
up axis; verification), `verify.py` (fresh-session re-import), `package.py` (ZIP). Presets for Blender, Maya, Unreal, Unity,
Godot, Universal. API: `GET /export-presets`, `POST /models/:id/export`, `GET /exports`, `GET /exports/:id`,
`GET /exports/:id/download` (10-minute signed URL), `DELETE /exports/:id`. UI: Export dialog in the workspace and Export
Center page (new export + history with per-file validation and download).
**Tests:** `test/exports.test.ts` — demo model exported to all 7 formats; every file validated with the exact triangle count;
ZIP downloaded via signed URL contains README, metadata (units, demo flag) and each extension; cross-user download → 404.
Real scan: Unreal preset with LOD0–LOD2 + collision → 9 validated files (FBX 8,000/4,000/2,000 tris, USD, GLB);
Universal → GLB, GLTF, OBJ, STL, USDZ validated. Playwright: export dialog → Export Center → package downloaded.
**Found & fixed:** packed GLB textures had no path (FBX copy failed) → saved to Textures/; Blender build lacks USD → pxr;
STL included collision → excluded; inconsistent USD file names; `-Infinity` in verification JSON broke parsing.
**Import into Blender verified** (re-import step). Maya, Unreal Engine and Unity are not installed in this environment, so
import into those applications could not be tested here; files follow their documented conventions.

## Milestone 11 — Production infrastructure ✅
**Implemented:** Teams (Studio plan gate, invitations by email linked on sign-in, member removal, project sharing through
`projects.team_id` with RLS read access for active members, owner-only delete); billing (`/billing`, ledger with running balance via
window function, plan cards, checkout returns `payments_not_configured`, admin `npm run set-plan -w backend`); monthly plan credits
as a repeatable BullMQ job with per-user-per-month idempotency; error recovery (reaper on start and every 10 min: generations whose
queue job is gone/failed are failed with refund; processing/export jobs stuck > 3 h failed); work-dir cleanup; worker heartbeats with
CPU load, RAM, process RSS and `nvidia-smi` GPUs; `/api/system/metrics` (workers + queue counts), `/api/health/ready` (DB, Redis,
storage); request IDs (`x-request-id`, included in 500 responses); single-attempt queues for non-idempotent jobs.
UI: Team Workspace, Notifications, Profile, Settings (General preferences, Security: password + sessions, Plan & credits with
ledger, System status with workers/queues, Account deletion). App-level 404.
**Security recap:** bcrypt(12) + JWT sessions with revocation; RLS on every user table (tested at SQL level); server-side ownership
checks; zod validation on every endpoint; rate limits (global + stricter auth/upload/generation); helmet headers; magic-byte upload
verification, size/megapixel/quota limits; HMAC-signed expiring file URLs (S3 presigned in production); secrets only in env;
provider webhooks token-checked and treated as hints.
**Tests:** `test/infra.test.ts` 4/4 (team plan gate, invite linking, RLS visibility for member vs outsider, member cannot delete;
running balance; monthly credits once per month; checkout not configured; reaper fail + single refund; readiness + request id).
Playwright: team, notifications, profile, settings tabs, export center, unknown route → 404; one React key warning fixed.

## Milestone 12 — Final QA & deployment ✅
**Implemented:** frontend unit tests (Vitest + RTL), Playwright e2e suite (`e2e/`: auth flows, full create → upload → generate →
inspect → export → download workflow, responsive overflow at 375/768 px + mobile navigation), Dockerfiles (API/worker image with
COLMAP, Blender, Python venv; nginx web image with SPA fallback and API proxy), `docker-compose.yml`, `workers/requirements.txt`,
README, docs/API.md, docs/DEPLOYMENT.md, architecture layout. Performance: lazy routes, three.js/R3F only on viewer routes
(public pages preload only the React runtime ≈ 133 KB gzip), GLB progressive byte progress, UV drawing caps, signed URL caching.
**Final verification (2026-11-20):**
| Check | Result |
|---|---|
| `npm run typecheck` (backend + frontend) | pass |
| `npm run lint` (0 warnings allowed) | pass |
| Backend integration tests (real Postgres, Redis, BullMQ, COLMAP, Blender) | **29/29** in 8 files |
| Frontend unit tests | **6/6** |
| Playwright e2e | **5/5** |
| Production builds (`tsc`, `vite build`); compiled API `/api/health/ready` | pass |
**Bugs found by this milestone's tests and fixed:** dashboard quick-action overflow at 375 px; three.js preloaded on public pages.
**Not verified here:** Docker image build / Compose (no Docker daemon in the build environment); Supabase mode against a live
project; S3/R2 driver against a live bucket; real Meshy/Tripo calls; import into Maya/Unreal/Unity (not installed).

---

# Final acceptance status

| # | Criterion | Status |
|---|---|---|
| 1 | Register and log in | ✅ local auth (e2e); Supabase mode implemented, not live-tested |
| 2 | Create projects | ✅ |
| 3 | Upload multiple reference photographs | ✅ |
| 4 | Assign camera angles | ✅ slots, per-image select, drag-to-slot |
| 5 | Validate image coverage | ✅ coverage, quality metrics, ORB/RANSAC overlap |
| 6 | Select AI or Precision reconstruction | ✅ |
| 7 | Configure generation | ✅ capability- and plan-driven options |
| 8 | Start actual generation or reconstruction jobs | ✅ photogrammetry (real COLMAP); AI: ⚠️ CONFIGURATION REQUIRED (keys + network); demo labelled |
| 9 | Track real processing status | ✅ observed stages, provider/pipeline metrics, event log |
| 10 | View generated 3D models | ✅ |
| 11 | Rotate, zoom, inspect geometry | ✅ |
| 12 | Inspect textures and materials | ✅ |
| 13 | View model statistics | ✅ measured |
| 14 | Compare models against references | ✅ silhouette IoU (true camera poses for photogrammetry) |
| 15 | Validate dimensions | ✅ absolute (calibrated) / proportional |
| 16 | Refine models | ✅ versioned |
| 17 | Optimise game assets | ✅ LODs, normal bake, collision, readiness gate |
| 18 | Prepare rigging where supported | ⚠️ provider rigging path implemented (needs provider keys); skeleton/animation inspection and export work |
| 19 | Export FBX, GLB, GLTF, OBJ, USD | ✅ plus USDZ, STL; re-import validated |
| 20 | Download model and texture packages | ✅ ZIP via signed URL |
| 21 | Import into Blender, Maya, Unreal, Unity | ✅ Blender (automated re-import); ⚠️ others not installed here — files follow documented conventions |
| 22 | Manage projects and model versions | ✅ |
| 23 | Access previous generations | ✅ history |
