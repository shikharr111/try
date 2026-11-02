# SitePulse: AI construction project monitoring

Multi-project construction monitoring on Next.js 15 (App Router, TypeScript), Tailwind, Supabase (Postgres, Auth, Storage, RLS) and Recharts. Progress, schedule variance, forecasts and the critical path come from a **deterministic, documented, tested calculation engine** that is independent of the AI. The AI only explains those numbers; it is advisory and every recommendation needs human approval.

> **Read `docs/STATUS.md` first.** It states exactly what was verified by running it and what is UNVERIFIED (everything that needs `npm install`: the Next.js/React layer, Supabase client calls, Recharts, exceljs, the live AI API).

## Requirements
- Node.js >= 20.9, npm
- A Supabase project (or the Supabase CLI for local development)
- Optional: an Anthropic API key for AI delay analysis

## Setup (local)
1. `npm install`
2. `cp .env.example .env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`. The service-role key is deliberately not used anywhere.
3. Create the database schema:
   - Supabase CLI: `supabase start`, then `supabase db reset` (applies `supabase/migrations/*` in order, then `supabase/seed.sql` if configured), or
   - hosted project: `supabase link --project-ref <ref>` then `supabase db push`; or paste the migration files in order (`…01` to `…07`) into the SQL editor.
4. (Demo only) run `supabase/seed.sql` once, in the SQL editor or with `psql`. It creates two organizations, three projects, five users and realistic reports. **Never seed demo accounts in production**: they share a public password.
5. In Supabase > Authentication > URL Configuration add `http://localhost:3000/auth/callback` (and your production URL + `/auth/callback`) to the redirect URLs.
6. `npm run dev` and open http://localhost:3000.

Demo accounts (password `DemoPass#2026`): `admin@demo.sitepulse.test` (org admin), `pm@demo.sitepulse.test` (project manager), `engineer1@…` / `engineer2@…` (site engineers), `outsider@other.sitepulse.test` (a different organization, used to demonstrate isolation). Seed dates are relative to the day you run the seed.

## Environment variables
See `.env.example` (every variable is documented there). Only `NEXT_PUBLIC_*` values reach the browser. `ANTHROPIC_API_KEY` and `AI_MODEL` are server-only; with them unset, the AI page shows a clear "not configured" state and everything else works.

## Deploy to Vercel
1. Push the repository, import it in Vercel (framework: Next.js; defaults are fine).
2. Add the environment variables from `.env.example` for Production (and Preview if wanted).
3. Run the migrations against the production Supabase project (`supabase db push`); do **not** run the demo seed.
4. Set `NEXT_PUBLIC_SITE_URL` to the production URL and add `<url>/auth/callback` to Supabase redirect URLs.
5. The AI page sets `maxDuration = 120`; on Vercel Hobby the platform cap is lower, so use a plan that allows it or expect long analyses to time out.

## Tests
| Command | What it runs | Needs |
|---|---|---|
| `npm test` | 136 unit tests: calculation engine, CSV/import validation, analytics, AI validation/reconciliation, report payload validation, Gantt geometry | Node + `tsx` only |
| `npm run typecheck:lib` | strict type check of everything under `src/lib` (no React/Next) | `typescript` |
| `npm run test:db` | Postgres suite: migrations, seed, RLS as real `authenticated`/`anon` roles, triggers, RPCs, import transactions | a local Postgres 16 (`PGHOST/PGPORT/PGUSER` env), no Supabase needed: a shim stubs `auth`/`storage` |
| `npm run typecheck`, `npm run build` | whole app | after `npm install` (UNVERIFIED until you run them) |

## Layout
```
src/lib/calc        calculation engine (+ FORMULAS.md: every formula)
src/lib/ai          snapshot, prompt, schema validation, reconciliation, feasibility checks, client
src/lib/import      CSV/Excel column mapping + validation;  src/lib/csv  parser/writer
src/lib/analytics   S-curve, variance, delay, resource aggregations;  src/lib/gantt  layout geometry
src/lib/server      session, data loading, import/AI services, exceljs wrapper (server-only)
src/app             routes, server actions (src/app/actions), API routes (…/api/{import,export,template})
src/components      UI kit, charts, gantt, forms, import wizard
supabase/migrations schema, triggers, RLS, storage, RPCs;  supabase/seed.sql;  supabase/tests
```

## Security model (summary)
- Every request uses the signed-in user's Supabase session; RLS on every table decides access. No service-role key exists in the code.
- Roles: organization admin, project manager, site engineer. Organizations and projects are isolated by RLS (tested with a second organization).
- Integrity is enforced in the database (triggers): approved baselines are immutable, report status transitions, approved reports locked, one draft revision, dependency cycles blocked, last admin protected. UI permission hiding mirrors this but is never relied on.
- Uploads: private bucket, type/size allow-list, short-lived signed URLs.
- AI: receives only a deterministic snapshot; site text is truncated, escaped and labelled untrusted; output is schema-validated and reconciled (unsupported "confirmed" causes are downgraded, invented costs/dates removed). No blame attribution fields exist.

## Workspace
After signing in the site opens on `/workspace` (InfraTrack UI). Run `supabase/migrations/20261025000008_infratrack.sql` once (it is already included in `supabase/setup_all.sql`). The earlier SitePulse pages remain at `/dashboard`.
