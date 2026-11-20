# AI Providers

Vistora 3D talks to AI 3D-generation services through adapters in `backend/src/providers/`.
API keys live **only** in the backend environment; the frontend never sees them.

| Provider | Adapter | Status in this build |
|---|---|---|
| Meshy | `meshy.ts` | Implemented · **CONFIGURATION REQUIRED** (set `MESHY_API_KEY`) |
| Tripo | `tripo.ts` | Implemented · **CONFIGURATION REQUIRED** (set `TRIPO_API_KEY`) |
| Demo | `demo.ts` | Enabled with `DEMO_MODE=true` · procedural, never uses your photos |

> **Verification status.** The build environment could not reach `docs.meshy.ai`, `platform.tripo3d.ai`,
> `api.meshy.ai` or `api.tripo3d.ai` (network policy), and no API keys were provided. The adapters follow
> the providers' public REST contracts as known at build time and are covered by contract tests against a
> local mock (`backend/test/mockProviders.ts`). **Before production, re-check the field names listed below
> against the current official documentation** and run one real generation per provider.

## Adapter interface

```ts
interface AIProvider {
  capabilities: ProviderCapabilities;          // drives which options the UI shows
  selectInputs(images): { selected, reason };   // which images are actually sent (stored as used_image_ids)
  createTask(selected, settings, ctx): { taskId, request, endpoint };
  getTask(taskId, endpoint): { status, progress|null, outputs, error };
  cancelTask?(taskId, endpoint); createRigTask?(sourceTaskId, settings);
}
```

## Meshy

| Item | Value used |
|---|---|
| Base URL | `MESHY_API_BASE` (default `https://api.meshy.ai`) |
| Auth | `Authorization: Bearer <MESHY_API_KEY>` |
| Single image | `POST /openapi/v1/image-to-3d` `{ image_url }` (base64 data URI) |
| Multi image | `POST /openapi/v1/multi-image-to-3d` `{ image_urls: [1–4] }` |
| Options | `ai_model`, `topology` (`triangle`/`quad`), `target_polycount`, `should_remesh`, `should_texture`, `enable_pbr`, `symmetry_mode`, `texture_prompt` |
| Create response | `{ result: "<task id>" }` |
| Status | `GET /openapi/v1/<endpoint>/<id>` → `status` (`PENDING`, `IN_PROGRESS`, `SUCCEEDED`, `FAILED`, `CANCELED`), `progress`, `model_urls.glb`, `thumbnail_url`, `task_error.message` |
| Cancel | `DELETE /openapi/v1/<endpoint>/<id>` |
| Rigging | `POST /openapi/v1/rigging` `{ input_task_id, height_meters }` → result `rigged_character_glb_url` |

Selection: at most **4** images; canonical views ranked front → diagonals → sides → back, blurry images last.

## Tripo

| Item | Value used |
|---|---|
| Base URL | `TRIPO_API_BASE` (default `https://api.tripo3d.ai/v2/openapi`) |
| Auth | `Authorization: Bearer <TRIPO_API_KEY>` |
| Upload | `POST /upload` multipart `file` → `data.image_token` (also accepts `file_token`) |
| Single image | `POST /task` `{ type: "image_to_model", file: { type, file_token } }` |
| Multiview | `POST /task` `{ type: "multiview_to_model", files: [front, left, back, right] }` (missing views as `{}`; front required) |
| Options | `model_version`, `texture`, `pbr`, `texture_quality` (`standard`/`detailed`), `face_limit`, `quad` |
| Status | `GET /task/<id>` → `data.status` (`queued`, `running`, `success`, `failed`, `cancelled`, `banned`, `expired`, `unknown`), `data.progress`, `data.output.pbr_model` / `model` / `base_model` |
| Rigging | `POST /task` `{ type: "animate_rig", original_model_task_id, out_format: "glb" }` |

Selection: multiview only uses Front, Left, Back and Right; otherwise the best single image (`image_to_model`).

## Job lifecycle

1. `POST /api/generations` validates settings against provider capabilities and the user's plan, then
   inserts the generation **and** charges credits in one transaction (`gen:<id>:charge`).
2. The `ai-generation` worker selects inputs, creates the provider task and stores `provider_task_id`.
3. It polls every `PROVIDER_POLL_INTERVAL_MS` (default 5 s) until done or `PROVIDER_TIMEOUT_MS` (30 min).
   Progress shown in the UI is the provider's own `progress` field and is labelled as such.
4. On retry or worker restart, an existing `provider_task_id` is **resumed**, never duplicated (avoids double provider charges).
5. On success the GLB is downloaded, magic-checked (`glTF`), stored as version 1 and analysed.
6. On failure or cancel: refund once (`gen:<id>:refund`, unique), notification, provider task cancelled when supported.

## Webhooks

`POST /api/webhooks/:provider?token=<PROVIDER_WEBHOOK_SECRET>` is accepted as a **hint only**: the payload is
logged against the matching job, and the authoritative status always comes from polling the provider API.
Register this URL in the provider dashboard if supported.

## Demo mode

`DEMO_MODE=true` exposes "Demo (procedural, not from your photos)". It runs `workers/model-processing/demo_model.py`
in Blender to build category-shaped placeholder geometry with UVs and a texture. Every artefact is flagged
`is_demo=true` and carries a warning badge. It costs 0 credits and exists to test the viewer, validation and export pipeline.
