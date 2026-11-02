# SitePulse: status, verification and limitations

Last updated: 2026-10-25. Rule used throughout: **nothing is called "verified" unless it was actually executed in the build sandbox.** The sandbox could not reach the npm registry (HTTP 403), so `npm install` was never possible and the Next.js layer has never been compiled or run.

## 0. InfraTrack workspace (added 2026-10-25)
The site now opens on `/workspace`: the supplied InfraTrack UI (dashboard, plan vs actual, activities, Gantt, cost, safety, delays, contractors, resources, forecast, DPR, report, backup, audit, copilot, photo counter) ported into `src/infratrack/InfraTrack.tsx`. Login is unchanged (the existing Supabase sign-in/up pages and cookie session). The older SitePulse pages are untouched and still reachable at `/dashboard`.
- Its data is stored per user in `it_projects`, `it_project_data`, `it_user_state` (migration `20261025000008_infratrack.sql`, also appended to `setup_all.sql`). This SQL must be run once on the real Supabase project or cloud saving shows "Sync failed".
- It does not use the SitePulse relational data, approvals, roles or AI delay-analysis; the two models are separate.
- **Verified (executed):** the new tables' RLS and revision logic against a throwaway Postgres (`supabase/tests/40_infratrack.sql`, plus the whole existing DB suite); `tsc --noEmit`, `npm test` (136) and `next build` on GitHub Actions.
- **UNVERIFIED:** how the screens look and behave in a browser, cloud save against real Supabase, the camera/voice/weather features, the in-browser AI photo counter (downloads a model from a CDN), Excel/PDF export, Hindi toggle. The file is checked as plain JS-style code (`// @ts-nocheck`), so TypeScript does not type-check its internals.
- Sign-in screen: `/login` is now the InfraTrack sign-in / create-account screen (`src/infratrack/LoginScreen.tsx`), using the site's real Supabase accounts (browser client, cookie session; `/signup` redirects to its second tab; password reset still uses `/forgot-password`). Executed in a test browser with a MOCKED Supabase client: validation messages, wrong-password message, welcome screen, redirect to `/workspace`, sign-up metadata and the 10-character password rule. **UNVERIFIED:** the real round trip against the live Supabase project (and confirm-email behaviour).
- The supplied file contained a different Supabase project URL and key; they were removed and the app now reads this project's environment variables.

### Data Entry section (added 2026-10-27)
- New sidebar item **Data Entry** (`/workspace`, view `dataentry`): daily report (with +/- steppers, planned-number and copy-last helpers, auto-saved draft, missing-day chips, photo counter), activity progress for many activities at once, cost, safety incident, and paste/CSV bulk import of daily reports with per-row validation.
- The old entry form was removed from Plan vs Actual; its Edit button now opens that day in Data Entry. All other pages are unchanged.
- Verified (executed, stubbed icons/charts/Supabase, Chromium): page opens, bulk preview and import, activity, cost and incident saves, edit jump, validation messages. UNVERIFIED: real Supabase sync of the new entries, real icons, phone layout (the shell itself scrolls sideways at 390px, not specific to this page), photo counter inside Data Entry.

### Site features batch (added 2026-10-29)
- Landing: dark/light toggle (remembered), site search, scroll progress bar, expandable FAQ, last-updated date, floating contact button with a form (error + success states), back-to-top, sticky header, mobile menu, skip-to-content link.
- Everywhere: cookie notice, loading spinner, print stylesheet, UTM capture (first `?utm_*` link is remembered and attached to contact messages).
- Login/signup: show/hide password. Workspace: confirm before log out and before deleting a daily report, copy-site-link button on About.
- Contact messages go to `contact_messages` (migration `20261029000009_contact.sql`, also in `setup_all.sql`; DB-tested in `41_contact.sql`). **This SQL must be run once on the real Supabase project** or the contact form shows "Messages are not set up". Read messages in Supabase > Table Editor > contact_messages.
- Verified (executed, stubbed icons, Chromium): dark toggle, search, FAQ, progress bar, contact form error/success/server-error, UTM in the payload, copy button, both confirm modals, password toggle. UNVERIFIED: real Supabase insert, print output, phone layout of the new widgets, cookie banner on every page.

### Share preview, favicon, Privacy and Terms (added 2026-10-29)
- Open Graph / Twitter metadata in `src/app/layout.tsx` with `public/og-image.png` (1200x630, own design) and `src/app/icon.svg`. The site address comes from `NEXT_PUBLIC_SITE_URL`, else Vercel's production URL; set `NEXT_PUBLIC_SITE_URL` in Vercel if the preview shows a wrong domain.
- `/privacy` and `/terms` are public pages (middleware allow-list), linked from the landing footer and the cookie notice. Plain-language drafts written from what the code actually does; **not reviewed by a lawyer**.
- Verified: privacy page renders (server render + Chromium, no sideways scroll at 390px). UNVERIFIED: how WhatsApp/LinkedIn/Facebook show the preview (they cache; use their debuggers to refresh), the /terms page render, the favicon in browsers.

## 1. VERIFIED (executed, passing)
| Area | How it was verified | Result |
|---|---|---|
| Calculation engine, CSV/import validation, analytics, AI validation/reconciliation/feasibility, report payload validation, resource aggregation, Gantt geometry | `npm test` (`tsx --test`) | **136 tests, 136 pass, 0 fail** |
| Strict typing of all `src/lib/**` | `tsc -p tsconfig.lib.json` | clean |
| Database: 7 migrations, seed, RLS as real `authenticated`/`anon` roles, integrity triggers, RPCs, transactional imports, org isolation | `bash supabase/tests/run_db_tests.sh` on a throwaway Postgres 16 | exit 0, "ALL DB TESTS PASSED" (150 `ok -` assertions + PASS summaries), re-run on a fresh cluster on 2026-10-25 |
| Syntax of all app TS/TSX (pages, components, actions, routes) | TypeScript parse (no TS1xxx syntax errors) | **syntax only**. This is NOT a type check: react/next/supabase types are absent, so ~2,000 type errors from missing declarations were expected and ignored. One genuine type error found this way (`Map` inference in `import-service.ts`) was fixed |

## 2. UNVERIFIED (written, never executed)
- Everything under `src/app`, `src/components`, `src/lib/server`, `src/lib/supabase`, `src/middleware.ts`: Next.js 15 / React 19 behaviour, server actions, route handlers, `useActionState` forms, redirects/flash messages.
- `@supabase/ssr` cookie handling, PostgREST embedded-select syntax used in pages (e.g. `report:daily_reports!inner(status)`, FK-hinted profile joins), `.in("report.status", …)` filters, Storage upload/signed URLs. The SQL side is tested against a Supabase *shim*, not real Supabase (Auth, Storage, PostgREST were not available).
- Recharts charts, SVG Gantt rendering (geometry is unit-tested; pixels were never seen), print layout, responsive layout, accessibility behaviour.
- `exceljs` read/write (`src/lib/server/xlsx.ts`), including date-cell handling.
- The live AI provider call (`AnthropicClient`: request shape, headers, retry on real error codes). The client is unit-tested against a fake `fetch` only.
- Package versions in `package.json` (never resolved).
- Vercel deployment and the `maxDuration` setting.

First thing to do on a machine with network access: `npm install && npm run typecheck && npm run build && npm run dev`, then walk the demo accounts through each page. Expect some type/runtime fixes in the UNVERIFIED layer.

## 3. Feature status
Legend: **Done+tested** = logic executed in tests. **Written** = code exists, UNVERIFIED.

| Module | Status |
|---|---|
| Auth (sign up/in, reset), onboarding, organization & members | Written (pre-existing pages) + DB side Done+tested |
| Roles & strict isolation (org admin / PM / site engineer) | **Done+tested** (RLS + triggers) |
| Multi-project dashboard with live KPIs, demo data clearly labelled | Written (dashboard pre-existing; KPIs from the tested engine) |
| Project creation/settings, calendar, holidays, members, audit log | Written |
| Baseline revisions, WBS group, dependencies, milestones, custom daily targets, approval, immutability | DB rules **Done+tested**; pages Written |
| Gantt with real critical path (FS only, lag, float, cycle detection) | Engine **Done+tested**; layout geometry tested; rendering Written |
| Daily reports: draft/edit/submit/recall/review/return, duplicate & conflict prevention, locked approved reports, edit audit trail, attachments | DB **Done+tested**; payload validation tested; UI/actions Written |
| CSV/Excel import: mapping, validation, preview, duplicate detection, row-level errors, all-or-nothing, never overwrites | Validation + transactional RPCs **Done+tested**; wizard/routes/xlsx Written |
| Filtered CSV/Excel export, templates | Row builders tested; routes Written |
| Calculation engine (progress, shortfall, earned-schedule variance, forecast, CPM, health, workforce/machine metrics) + `FORMULAS.md` | **Done+tested** |
| AI delay analysis: validated JSON, confirmed vs hypothesis, no invented cost/dates, feasibility checks, history with metric snapshot, recovery-plan approval | Safety logic **Done+tested**; page/action/live call Written |
| Delay reason management (no blame field exists), distribution analytics | DB **Done+tested**; pages Written |
| Analytics (range, granularity, S-curve, per-period, delays, workforce, machines) | Aggregations **Done+tested**; page Written |
| Printable progress report | Written |
| Migrations, seed (3 projects, 2 orgs), `.env.example`, README, tests | Done |

## 4. Known limitations and design decisions
- Dependencies: finish-to-start only (other types are rejected, not approximated).
- Forecasts need >= 3 reporting days; otherwise status is `insufficient_data` and no date is shown. Unreported days are never treated as zero.
- No cost/earned-value forecasting; budget is display-only. The AI is told not to invent costs.
- Imports are all-or-nothing; existing records are never overwritten; activity codes are case-sensitive; dates are ISO or day-first DD/MM/YYYY. Legacy `.xls` is unsupported. Limits: 5 MB, 20,000 rows.
- Delay events entered in a report form are always new events (existing ones are edited on the Delay events page).
- Report date and shift cannot be edited after creation (they identify the report).
- The dashboard computes metrics per project on request (limit 30 projects); there is no caching or background job.
- AI analysis is rate-limited per project per rolling 24 h (`AI_DAILY_LIMIT_PER_PROJECT`). Long model calls need a Vercel plan whose function limit allows `maxDuration` 120 s.
- An organization admin adding a member by exact e-mail can learn whether that e-mail has an account (documented trade-off).
- Duplicate `id="confirm-title"` can occur when many confirm dialogs are rendered on one page (minor a11y item).
- No end-to-end (browser) tests exist.

## 5. File map of this work
Created in the final stage (all UNVERIFIED unless noted): `src/components/{charts,gantt,report-form,import-wizard}.tsx`; `src/app/(app)/projects/[projectId]/{layout,page}.tsx` and `plan|reports|reports/new|reports/[reportId]|delays|analytics|import|ai|progress-report|settings/page.tsx`; `…/api/{import,export,template}/route.ts`; `src/app/actions/{reports,delays,ai}.ts`; `src/lib/server/{xlsx,import-service,ai-service,resources-data}.ts`; **verified:** `src/lib/reports/payload.ts`, `src/lib/ai/resources.ts` and their tests. Also: `package.json` script `typecheck:calc` repointed to `tsconfig.lib.json`; `.env.example` comment fix; `README.md`, `.gitignore`, this file.

## 6. Phase 1 (UI/UX) addendum, 2026-10-25
Everything below is **written and UNVERIFIED** (never rendered or compiled with React/Next). Only the pure helper `delayTrendByMonth` is tested (3 new tests; suite now 136/136). A TypeScript *syntax* scan of all app files found 0 syntax errors; the remaining type errors are missing-declaration noise from absent react/next packages. A static check confirmed every internal link in the source resolves to an existing route (27 routes).

Implemented in this phase (reusing existing actions, queries and the calculation engine; no schema or engine changes):
- **App shell:** icon sidebar (collapsible, remembered per browser, mobile slide-over with Esc/backdrop close, organization list, searchable project switcher), sticky top bar with breadcrumbs, project search, notifications menu, account menu. Icons are an inline SVG set (`components/icons.tsx`), so no new dependency.
- **Notifications:** derived from live rows (reports awaiting review, unreviewed delays, your returned/draft reports). Nothing stored or simulated.
- **Toasts:** `?ok=`/`?err=` messages now display as dismissible toasts (errors persist until dismissed; the URL parameter is cleaned).
- **States:** loading skeletons (`loading.tsx`), error boundary with reference digest (no raw error text), global 404; reduced-motion support.
- **Dashboard:** added per-project planned-vs-actual chart, monthly delay-trend chart (new tested helper), resource-utilization table (first 10 projects), tooltips (`Hint`).
- **Projects list:** live health, planned/actual bar, variance, forecast, manager, filters (search/status/health) and sort; edit link.
- **Plan page:** activity table (work package, dates, working-day duration, quantity/unit, progress, predecessors, critical/float), filters including date range and critical-only (also filter the Gantt), milestone summary. Critical path shown only from the engine.
- **Project overview:** quick actions, resource overview, forecast assumptions.
- **Analytics:** glossary separating progress shortfall, schedule deviation and forecast delay; forecast-delay column; explanatory tooltips; resource-shortfall disclaimer.
- **Account:** profile (name), security (change password with current-password check, sign out other devices), notifications page, read-only application-configuration panel for org admins (no secret values shown).

Deliberately NOT built because no backend exists (shown as disabled/explained, not simulated): email/push notification preferences, two-factor authentication, cost/benefit estimates beyond what the AI is given, multi-organization switching beyond the dashboard `?org=` filter.

Still unverified and worth checking first in a browser: dropdown dismissal (notifications/account menus), sidebar collapse persistence, toast clean-up of the URL, mobile layout of the report form, print layout.

## 6. Phase 1 (UI/UX) review, 2026-10-25
Inspected the existing code first. A Phase 1 UI layer already existed beside my earlier work: app shell (collapsible sidebar with organization and project switcher, top bar with project search, derived notifications and account menu), inline SVG icon set (`components/icons.tsx`, no extra dependency), toast/flash, skeleton `loading.tsx` and `error.tsx` boundaries, `Hint` tooltips, `LinkTabs`, grouped charts, extended dashboard (portfolio KPIs, per-project health table, delay trend, milestones, recent reports, critical activities, resource utilization), searchable/filterable projects list, account pages (profile, security, notifications), plan page with activity table/filters/Gantt, overview with resource overview, forecast assumptions and quick actions.

Changes made in this review:
- Plan page: an edit of mine collided with the existing filter implementation; repaired by keeping the existing version and re-deriving its filter variables (`state`, `critical`, `from`, `to`, `q`).
- AI page/action: added an optional "Analyse as of" date (server-validated, not in the future).
- Reports list: added the missing activity filter (UI + query).

Checks run after these changes (all executed): `npm test` 136/136 pass; `tsc -p tsconfig.lib.json` clean; TypeScript parse of every app file: 0 syntax errors; 0 undefined identifiers / duplicate declarations across all pages (TS2304/2451/2300/2552); a script confirming every named import resolves to a real export: 0 problems.

NOT verified: anything visual or interactive (layout at phone/tablet width, animations, keyboard/screen-reader behaviour, charts), real data flows, and the type correctness of the React/Next/Supabase layer. The icon set is inline SVG, so no icon package needs installing. Notification preferences have no backend column; check the account page for how that page labels this before relying on it.

## 7. First real-package verification (GitHub Actions, 2026-10-25)
Workflow `.github/workflows/check.yml` (Node 22, real `npm install`) publishes its reports to branch `ci-report`. For commit `fead174`: `npx tsc --noEmit` over the whole app = **0 errors** (two implicit-any errors in the Supabase cookie callbacks and one equipment-row mapping error were found by Vercel/CI and fixed); `npm test` = **136/136 pass**; `npm run build` (placeholder env) = **succeeds**, all 28 routes compiled.
Still UNVERIFIED: runtime behaviour against a real Supabase project (auth, RLS through PostgREST, storage), the live AI call, exceljs behaviour, and everything visual/interactive.

## Voice entry (Data Entry → Daily report)
- Mic card above the daily form: speak (English/Hinglish or Hindi) → text is parsed by `src/lib/voice/parseVoiceEntry.ts` into workers, machines, progress %, hours lost, weather, delay reason, remarks.
- Recognised fields are shown as chips; **Save for <selected date>** runs the normal `validateDailyEntry` + save for the date selected in Data Entry (never "today" unless that is the selected date). "Only fill the form" fills without saving. The transcript box is editable, so typing also works.
- Uses the browser Web Speech API (Chrome/Edge/Safari). Unsupported browsers get a message and can type.
- Verified: parser unit tests (6), browser run with a mocked mic against a mocked backend (saved on the selected date, today untouched, synced payload correct, phone layout).
- Not verified: real microphone, real recognition accuracy, Hindi (Devanagari) recognition on real devices.

## Hindi (full-page translation)
- The language toggle translates the page at runtime from dictionaries: `I18N_HI` (InfraTrack.tsx), `i18nHi.ts`, `i18nHi2.ts` (sentence rules with numbers) and `i18nHi3.ts` (about 670 bulk strings; `{0}` slots make templates). A scan of every page and tab in Hindi mode found the English leftovers, and they were translated: Data Entry (all tabs), Edit Planned Data, About, reports, backup, toasts and error messages, demo project text.
- Left in English on purpose: brand and technical words (InfraTrack, PDF, Excel, CSV, WhatsApp, CPI, SPI), people and company names, and anything the user types (project names, notes, remarks).
- New text added to the app later must also be added to `i18nHi3.ts` (pairs of English and Hindi) or it will stay English in Hindi mode.

## Site Activity (sidebar)
- Sidebar "Site Activity": laptop monitor shows QR/link; phone opens `/camera?cam=<id>` (public route) and streams live video over WebRTC (PeerJS). People counting runs in the browser (TensorFlow.js COCO-SSD). Video is not uploaded to our servers.
- Third parties at runtime: PeerJS public signalling server, Google/Twilio STUN, Open Relay TURN (static-auth, video may relay encrypted through it), jsDelivr CDN scripts for PeerJS and the people detector (no SRI); the QR code is generated in-app. Phone needs HTTPS and internet on both devices.
- Verified in harness only (mocked PeerJS/QR/camera); real streaming/detection unverified.
- Backup path: if the direct WebRTC link fails (ICE failed / 9 s without connecting / laptop sees no video), the phone sends ~4 JPEG frames/s through a Supabase Realtime broadcast channel (name includes a random secret from the QR link `&k=`). Laptop rebuilds a video stream from the frames, so counting still works. Tested in harness with a mocked channel only; real Supabase Realtime unverified.
- Motion: a person counts as "moving" if their box centre moves OR enough pixels change inside their box (catches working in place); ignored when the whole picture shakes. Detection score 0.55, min height 8%, needs 3 hits; pixel-change threshold 0.18-0.12*sens. Relay frames 960px/q0.6. Harness-verified with a mocked detector; real people/accuracy unverified.
- Page edges: `useBackdrop(color)` paints html/body + theme-color to the current screen colour (workspace dark/light, landing dark/light, login black); default html background #f5f6f7 for other pages. Fixes the white flash on swipe-back/overscroll on phones. Workspace verified in harness; landing/login and real iOS/Android swipe unverified.
- Copilot: answers come from `src/lib/copilot/answer.ts` (pure, tested). Scored topic detection (delay, cost, forecast, safety, contractors, workers/machines, weather, progress, focus) with English/Hinglish/Hindi keywords; a named activity or contractor gets its own answer; unknown questions get an honest "not sure" + what it can answer (no random alerts). Still rule-based, not an LLM: it can only answer what is in the project data. Verified in harness with the demo project.
- Email: "Email me" button on Daily Progress Report (POST /api/email/dpr -> signed-in user's own login email only) and an 8 PM IST reminder (vercel.json cron -> /api/cron/daily-reminder, protected by CRON_SECRET, recipient REMINDER_TO). Sender = Resend REST API. Setup in docs/EMAIL.md. Tested: renderers, payload validation, cron auth, request shape (unit); button UI in harness. UNVERIFIED: real email delivery, Vercel cron firing, Resend account limits.

## Northern Ayodhya Bypass demo (NHAI, HAM)
- Second demo project, loaded from the empty-state screen, the Add Project dialog or the project dropdown ("Northern Ayodhya Bypass demo").
- **Real (from the public case study PDF):** NHAI, NHDP Phase-VII, Ceigall India Ltd / SPV Ceigall Northern Ayodhya Bypass Pvt Ltd, 35.40 km (Part 1 NH-27 km 112+540–139+928, Part 2 km 0+000–5+000), HAM, bid project cost ₹1,199.30 Cr, appointed date 9 Jul 2025, 912 days.
- **Simulated:** all daily progress, labour, machinery, costs, incidents and activity quantities (not public). The project name and toast say so.
- Implemented via `DEMO_AYODHYA` config passed to `buildDemoProject(C)`; Pune demo unchanged.
- Verified locally in a browser harness: button, load, dashboard render. Not verified: Hindi view of the new project, real Supabase save.

## Aguwani–Sultanganj Ganga Bridge demo (Bihar, case study)
- Third demo project, loaded from the empty-state screen, the Add Project dialog or the project dropdown ("Load Demo: Aguwani–Sultanganj Ganga Bridge").
- **Real (from the uploaded case-study report, itself media-based):** Aguwani (Khagaria) to Sultanganj (Bhagalpur) over the Ganga, Bihar; S.P. Singla Constructions Pvt. Ltd.; reported project cost about ₹1,710.8 Cr; collapses on 30 Apr 2022 and 4 Jun 2023.
- **Simulated:** schedule, quantities, labour, machinery, costs, daily reports, delays and incidents (the report has none). The timeline is relative to today and does not reproduce the real collapse dates. Nothing in the demo states a cause or assigns responsibility.
- Implemented via `makeDemoSultanganj()` passed to `buildDemoProject(C)`; Pune and Ayodhya demos unchanged.
- Verified in a node harness: builds 258 daily reports, 11 activities, 545 activity logs, 29 costs, 9 incidents. Not verified: rendering in a browser (no npm install possible in the sandbox), Hindi view of the new text.
