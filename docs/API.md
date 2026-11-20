# REST API

Base path `/api`. JSON in/out. Authenticated endpoints need `Authorization: Bearer <token>` (local JWT or Supabase access
token). Errors: `{ "error": "<code>", "message": "...", "details"?, "request_id"? }` with a matching HTTP status
(400 validation, 401, 402 insufficient credits, 403 plan/permission, 404 not found or not yours, 409 conflict, 413 quota,
422, 429 rate limit, 503 configuration required). Every response carries `x-request-id`.

## Auth
| Method | Path | Notes |
|---|---|---|
| GET | `/auth/config` | `{ mode: local|supabase, google }` |
| POST | `/auth/register` | `{ email, password, full_name? }` → `{ token, user }` (local mode) |
| POST | `/auth/login` | `{ email, password }` → `{ token, user }` |
| POST | `/auth/logout` | revokes the session |
| POST | `/auth/forgot-password` | always 200 (no enumeration); emails a 1-hour single-use link |
| POST | `/auth/reset-password` | `{ token, password }`; revokes all sessions |
| GET / PATCH / DELETE | `/auth/me` | profile; `DELETE` needs `{ confirm: "DELETE" }` |
| POST | `/auth/change-password` | signs out other sessions |
| GET / DELETE | `/auth/sessions`, `/auth/sessions/:id` | session management |

## Projects, uploads, analysis
| Method | Path | Notes |
|---|---|---|
| GET / POST | `/projects` | list: `q, category, status, sort(updated|created|name), order, page, page_size` |
| GET / PUT / DELETE | `/projects/:id` | delete removes stored files |
| GET | `/projects/:id/manifest` | JSON project export |
| PUT | `/projects/:id/team` | share with a team `{ team_id|null }` |
| POST | `/uploads` | multipart: `project_id`, `angles` (JSON array) or `angle`, `files[]` → `{ items, rejected }` |
| GET / PATCH / DELETE | `/uploads/:id` | PATCH `{ angle?, custom_label? }` |
| POST | `/uploads/:id/replace` | multipart single `file` |
| GET | `/projects/:id/images` · PUT `/projects/:id/images/order` | list / reorder `{ ids }` |
| GET | `/projects/:id/analysis` | coverage, duplicates, blur, lighting, similarity, recommendations |
| POST | `/projects/:id/analysis/overlap` | ORB + RANSAC overlap check |

## Generation & reconstruction
| Method | Path | Notes |
|---|---|---|
| GET | `/providers` · `/system/status` · `/system/metrics` | capabilities & configuration · tools · workers/queues |
| POST | `/generations/preview` | dry run: images to be sent, cost, blocking issues |
| POST | `/generations` | `{ project_id, provider: meshy|tripo|demo, image_ids?, settings }` |
| GET | `/generations` · `/generations/:id` | history (filters) · status, stage, provider progress, events |
| POST | `/generations/:id/cancel` · `/generations/:id/refine` | cancel + refund · new generation with overrides |
| POST | `/reconstruction` | photogrammetry `{ project_id, image_ids?, settings{quality, matcher, known_dimension} }` |
| GET | `/reconstruction` · `/reconstruction/:id` | list · metrics + signed point cloud / cameras / log URLs |
| POST | `/reconstruction/:id/cancel` | terminates the COLMAP process group |
| POST | `/webhooks/:provider?token=` | provider callbacks (hint only) |

## Models
| Method | Path | Notes |
|---|---|---|
| GET | `/models` | library filters: `q, category, source, favorite, folder_id, tag, project_id, from, to, sort, order` |
| GET / PATCH / DELETE | `/models/:id` | PATCH `{ name?, favorite?, folder_id?, tags?, category? }` |
| POST | `/models/:id/duplicate` · GET `/models/:id/download` | copy with files · signed GLB URL |
| GET | `/models/:id/versions` · `/models/:id/metadata?version_id=` | versions · measured stats + integrity + source |
| PUT | `/models/:id/current-version` · DELETE `/models/:id/versions/:vid` | restore · delete non-current |
| POST | `/models/:id/validate` · GET `/models/:id/quality-report` | `{ measurements?{width,height,depth,unit} }` |
| POST | `/models/:id/refine` | `{ operations: [{op, ...}] }` ops: cleanup, fill_holes, remesh, smooth, decimate, normals, scale, place_on_ground, material, uv_unwrap, triangulate, texture_enhance |
| GET | `/game-presets` · POST `/models/:id/optimize` | `{ preset, budget, texture, lods, collision, normal_map, retopology }` |
| GET | `/models/:id/jobs` · `/processing-jobs/:id` | processing job status |
| GET / POST / PATCH / DELETE | `/folders` · GET `/tags` | asset organisation |

## Export
| Method | Path | Notes |
|---|---|---|
| GET | `/export-presets` | presets + formats |
| POST | `/models/:id/export` | `{ preset, formats?, version_id?, settings? }` → 202 job |
| GET | `/exports` · `/exports/:id` | per-file validation results |
| GET | `/exports/:id/download` | 10-minute signed URL (`?redirect=1` to redirect) |
| DELETE | `/exports/:id` | |

## Account, teams, billing, misc
`/dashboard`, `/notifications` (+ `/:id/read`, `/read-all`), `/teams` (GET, POST), `/teams/:id/invites`,
`/teams/:id/members/:memberId`, `/billing`, `/billing/transactions`, `/billing/checkout` (503 until a gateway is configured),
`/plans` (public), `/health`, `/health/ready`, `/files/:token` (local signed files).
