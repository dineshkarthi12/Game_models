# Milestone Tracker

Status legend: ⬜ Not started · 🟨 In progress · ✅ Complete (verified) · ⚠️ Complete with configuration required · ⛔ Blocked

| # | Milestone | Status | Notes |
|---|---|---|---|
| 0 | Repository audit & planning | ✅ | Plan, decisions, architecture docs written |
| 1 | Brand & design system | ✅ | Tokens, logo, primitives, layouts, style guide at /design-system |
| 2 | Landing page & authentication | ✅ | Local JWT auth verified; Supabase mode implemented, CONFIGURATION REQUIRED |
| 3 | Dashboard & projects | ⬜ | |
| 4 | Multi-view upload | ⬜ | |
| 5 | AI provider integration | ⬜ | |
| 6 | Photogrammetry | ⬜ | |
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
