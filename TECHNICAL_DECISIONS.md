# Technical Decisions

Each entry: decision · rationale · consequences.

## TD-01 Monorepo with npm workspaces (`frontend`, `backend`)
Simple, no extra tooling. Python processing lives in `workers/` with its own venv.

## TD-02 Fastify over Express
Built-in schema validation hooks, faster, first-class TypeScript, `@fastify/multipart` streaming uploads, `@fastify/rate-limit`.

## TD-03 Plain SQL migrations + `pg`, Supabase-compatible
Migrations in `database/migrations/*.sql` run against any Postgres 15+ including Supabase.
No ORM: queries are explicit and RLS-friendly. Zod validates input at the API boundary.

## TD-04 Row Level Security enforced for API requests, not only for Supabase clients
Every user-scoped request runs inside a transaction that does `SET LOCAL ROLE vistora_app`
and `set_config('app.current_user_id', …)`. Policies call `app_current_user_id()` which
returns `auth.uid()` on Supabase (when present) or the session setting otherwise.
Result: even a bug in a WHERE clause cannot leak another user's rows. Workers use the
owner role (system context) because they act on behalf of the job owner explicitly.

## TD-05 Pluggable auth: Local JWT (default) or Supabase Auth
`AUTH_MODE=local` – bcrypt password hashes, HS256 JWT (jose), password-reset tokens (hashed) in DB.
`AUTH_MODE=supabase` – frontend uses supabase-js (email/password, Google OAuth, reset);
backend verifies Supabase JWTs with `SUPABASE_JWT_SECRET` and upserts the `users` row.
Reason: the build environment has no Supabase project, and self-hosting must remain possible.

## TD-06 Storage driver abstraction
`STORAGE_DRIVER=local` (disk + HMAC-signed, expiring download URLs served by the API)
or `s3` (Cloudflare R2 or Supabase Storage S3 endpoint, presigned URLs). All files are private.

## TD-07 BullMQ on Redis for all heavy work
Queues: `ai-generation`, `photogrammetry`, `model-processing`, `export`.
The API never runs reconstruction/conversion in-process. Worker = `npm run worker`.

## TD-08 Native tools for real 3D processing
* **COLMAP** CLI for SfM (feature extraction, matching, mapping, undistortion).
* **Dense MVS requires CUDA.** With no GPU we use COLMAP's `delaunay_mesher --input_type sparse`
  (CPU) and texture by projecting the source photographs onto the mesh using recovered camera
  poses. Reports state `dense_mode: "cpu_sparse_fallback"` so quality is never overstated.
* **Blender 4.x headless** for refinement (decimate, smooth, merge-by-distance, voxel remesh,
  UV unwrap, LOD) and for **all format conversions** (FBX, OBJ, USD/USDZ, STL, glTF).
  Exports are re-imported by Blender to validate before a download link is issued.
  We never rename extensions to fake a conversion.
* **trimesh** (Python) for measurable mesh analysis: non-manifold edges, boundary edges,
  watertightness, degenerate faces, winding consistency, bounding boxes, silhouette IoU.

## TD-09 AI providers behind an adapter interface
`AIProvider { capabilities, createTask, getTask, cancelTask, downloadResult }`.
Capabilities (max input images, supported options) drive the UI so only genuinely supported
options are shown, and the generation record stores **which images were actually sent**.
Provider docs were unreachable at build time; field names follow the public APIs as known
and are flagged in `docs/AI_PROVIDERS.md` for re-verification.

## TD-10 Demo provider is explicit and labelled
`DEMO_MODE=true` enables a "Demo" provider that produces procedural geometry. Its models are
stored with `is_demo = true`, carry a permanent "Demo output — not reconstructed from your
photos" banner, and are excluded from accuracy claims. It exists so the viewer/validation/export
pipeline can be exercised without paid API keys.

## TD-11 Honest metrics
* Progress is only shown when a provider/pipeline reports it; otherwise we show the current stage.
* Reference Coverage (which angles exist) is computed and displayed separately from
  reconstruction quality metrics. No "accuracy %" is ever invented.
* Validation reports list each measured metric with its method and limitations.

## TD-12 Credits ledger with idempotency keys
`credit_transactions` is append-only with a UNIQUE `idempotency_key`
(`gen:<id>:charge`, `gen:<id>:refund`). Balance = SUM(amount). Double charges and double
refunds are impossible at the database level.

## TD-13 Frontend stack
React 18 + Vite + TS, Tailwind with design tokens, hand-written shadcn-style primitives
(Radix where needed), Zustand (auth/UI state), TanStack Query (server state), React Router,
R3F + drei for the viewer. Heavy routes (viewer) are lazy-loaded.
