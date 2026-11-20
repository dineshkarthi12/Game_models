---
title: Vistora 3D API
emoji: 🧊
colorFrom: purple
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# VISTORA 3D backend (Hugging Face Space)

API + queue workers (COLMAP photogrammetry, Blender, exports) + Redis in one container,
on the free CPU Space (2 vCPU, 16 GB RAM). Database: Supabase Postgres. Files: Supabase Storage (S3).

Copy this `README.md` and `Dockerfile` into a new **Docker** Space, then set in
**Settings → Variables and secrets**:

| Name | Type | Value |
|---|---|---|
| `DATABASE_URL` | Secret | Supabase Session pooler URL |
| `APP_SECRET` | Secret | long random string (32+ chars) |
| `S3_ACCESS_KEY_ID` | Secret | Supabase Storage S3 access key |
| `S3_SECRET_ACCESS_KEY` | Secret | Supabase Storage S3 secret key |
| `S3_ENDPOINT` | Variable | `https://<ref>.storage.supabase.co/storage/v1/s3` |
| `S3_REGION` | Variable | Supabase project region, e.g. `ap-southeast-2` |
| `PUBLIC_APP_URL` | Variable | Vercel site URL, no trailing slash |

Optional: `S3_BUCKET` (default `vistora`), `DEMO_MODE` (default `true`), `MESHY_API_KEY`, `TRIPO_API_KEY`.

The API is served at `https://<user>-<space>.hf.space/api` — set the Vercel variable
`VITE_API_BASE` to that and redeploy the frontend. To deploy new commits from GitHub `main`,
use **Settings → Factory rebuild**.
