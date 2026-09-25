# Wasooli — guide for Claude Code sessions

## What this is
Wasooli ("Know who's paid.") is a one-owner payments tracker for people who share paid SaaS accounts
(packages such as C, C Max, G). The owner records subscribers, their plans, payments (PKR or USD) and running
costs; the app works out billing periods, who is paid up or overdue, what to send on WhatsApp/email/Telegram,
and serves public choice pages (`/c/<token>`) where subscribers say continue / upgrade / discontinue.
It runs as a self-hosted Flask app on the owner's VM (wasooli.duckdns.org; links on pay-up.duckdns.org),
and the same `index.html` is also published as a claude.ai artifact and works browser-locally.

## Architecture
- `index.html` — the whole admin app: one file, vanilla JS in an IIFE, inline CSS, light/dark themes
  (`prefers-color-scheme` plus `:root[data-theme]`), inline SVG charts, no build step, no libraries.
  Three storage backends behind one `db` shape: the self-hosted server (`/api/docs/<path>`, detected via
  `window.__PT_SERVER__`), the claude.ai artifact runtime (`window.claude` db/downloads/sample/assets) and
  browser `localStorage` as the fallback.
- `server/` — Flask + SQLite. `app.py` (routes, `VERSION`, docs API, `/c/<token>`, `/healthz`, security
  endpoints), `auth.py` (passcode, per-IP lockout, hidden sign-in path `/x/<ADMIN_PATH>`, signed sessions),
  `db.py` (document store in `DATA_DIR/tracker.sqlite3`, `meta` table for server-side secrets),
  `notify.py` (daily reminder emails, run by a timer), `claude_read.py` / `gemini_read.py` (screenshot reading),
  `templates/` (login, neutral page, choice page).
- `deploy/` — `setup.sh` (idempotent installer: Caddy, venv, env file, systemd units), `update.sh`
  (auto-pull every 5 minutes), `backup.sh` (nightly SQLite backup), `systemd/` (units and timers).
- `assets/` — logo, mark, PNG icons, `manifest.webmanifest`, served by Flask at `/assets/<file>`.
- `README.md` (owner-facing), `CHANGELOG.md` (one entry per version, newest first).
- `docs/HANDOFF.md` — the hand-off: current state (VM, domains, paths), decisions log with the reasons, operations
  runbook, security model, known gaps; read it at the start of a session. `docs/setup-runbook.html` — the owner's
  step-by-step of how the server was built (a self-contained page; update it when a setup step changes).

## Deploy pipeline (do not fight it)
- Push to `main` on GitHub. `payments-tracker-update.timer` runs `deploy/update.sh` on the VM every 5 minutes:
  fetch, hard-reset to `origin/main`, reinstall requirements if `server/requirements.txt` changed, refresh the
  systemd units, append defaults for new env keys, restart `payments-tracker`. Pushing is the whole release.
- `deploy/setup.sh` is idempotent and keeps every existing value in `/etc/payments-tracker.env`
  (`DOMAIN`, `LINK_DOMAIN`, `OLD_DOMAIN`, `ADMIN_PASSCODE`, `SECRET_KEY`, `ADMIN_PATH`, `SESSION_DAYS`,
  `LOGIN_GLOBAL_PER_MINUTE`, `DATA_DIR`, `COOKIE_SECURE`, `ANTHROPIC_API_KEY`, `APP_TZ`). New keys need a
  default in code and, if the VM must pick them up, an `ensure_env` line in `update.sh`.
- Code lives in `/opt/payments-tracker` (disposable); data in `/var/lib/payments-tracker`
  (`tracker.sqlite3`, `backups/`, uploaded receipts). Never rename unit names, env keys, URL paths or data paths.

## Data model essentials
- Documents keyed by path: `settings/main`, `users/<id>`, `costs/<id>`, `meta/*`, `confirm/<token>`.
- `settings/main`: `rate` (default PKR per USD), `packages` `[{id,name,cycle,price,currency,description}]`,
  `anchor` + `cycleDay` (the shared billing cycle), `remindDay`, `replyDay`, message templates,
  `appName`, `tagline`, `publicBaseUrl`, `waApp`, `dimSettled`, AI/mail settings live server-side in `meta`.
- User: `name, email, phone, telegram, joinDate, notes, subscriptions[], reminders{}, cancel, cancelHistory[] (v27), discontinue,
  confirmToken`. Subscription (plan): `kind` monthly|one-time, `cycle` monthly|yearly, `packageId`, `currency`,
  `start`, `end`, `prorate`, `waiveFirst`, `prices[{from,price}]`, `discount`, `dueBy`,
  `tierHistory[{from,packageId,price,currency,note,via}]` (C ↔ C Max switches from a cycle start),
  `periodOverrides{periodStart:{amount?,packageId?,note,at}}` (hand-set amount and/or package for one period),
  `payments[{id,date,amount,currency,rate,note}]`. One-time items have `total` and `due`.
- Periods are computed, never stored: `analyzeMonthly` walks cycle periods from `pStart`, applies payments
  as credit in order, and yields paid/partial/unpaid/upcoming states, balance, next due. `analyze(u, today)`
  aggregates a user; `breakdownRows`, `monthlySeries` and `analyticsData` build the Summary and Analytics figures
  from the same functions, so numbers reconcile by construction. Reuse them; do not recompute money elsewhere.
- Costs: `date, description, category, packageId ('' = shared), currency, cost, tax, rate, receipt, source`.
- Migrations (`maybeSeedShared`, the migrate block) are lease-guarded via `meta/*` and idempotent: add fields with
  defaults, treat an absent field as the default, and never overwrite or delete owner-entered records.
- `todayISO()` honours `localStorage['pt-today']` (tests); the server's notify job honours `WASOOL_TODAY`.

## Conventions
- Every change bumps three things together: the badge (`<span id="app-ver">vNN</span>` in `index.html`),
  `VERSION = "NN"` in `server/app.py`, and a `## vNN - date` entry at the top of `CHANGELOG.md`.
- The repo `index.html` and the claude.ai artifact (`https://claude.ai/artifact/TirjtbYSsbjrMweoV3P4PA`,
  capabilities db, downloads, sample, assets) must stay identical: republish after each change.
- Before pushing, run the local Flask server and a Playwright pass (below); no new console or page errors.
- Style: keep the single-file, no-dependency approach; CSS tokens on `:root` with dark overrides in both dark
  blocks; new UI reuses `.panel`, `.tile`, `.brk`, `.seg`, `.chart-box`; comments say which version added what.
- Git: commit straight to `main`, imperative summary ending in `(vNN)`, short body; never force-push, no PRs.
  Never edit or delete records in the owner's data as part of a code change.

## Running locally
```bash
python3 -m venv venv && venv/bin/pip install -r server/requirements.txt
DATA_DIR=/tmp/wasooli-data ADMIN_PASSCODE=test1234 SECRET_KEY=x COOKIE_SECURE=0 ADMIN_PATH=TestPath \
  venv/bin/python -c "import sys; sys.path.insert(0,'server'); import app; app.app.run(port=8098)"
# sign in at http://127.0.0.1:8098/x/TestPath ; the page seeds sample users on an empty store
```
Playwright (Node): `require('/opt/node22/lib/node_modules/playwright')`, launch Chromium with
`executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'` and `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`;
never run `playwright install`. Pin the date with `localStorage.setItem('pt-today','2026-09-23')` in an init script.
Known, harmless console noise in the sandbox: Google Fonts `ERR_CERT_AUTHORITY_INVALID`, `/api/read-image` 501
(no AI key), first-load 404s for `settings/main` and `meta/seed` on an empty store.

## Checklist for a UI change
1. 1400px and 390px viewports, light and dark (`page.emulateMedia({colorScheme:'dark'})`): nothing clipped,
   no horizontal page scroll, labels legible, tables scroll inside `.table-wrap`.
2. Panels: the new view opens from the header, closes, and hides the others (`showPanel`).
3. Money: totals match the Summary tiles and the By product table for the same range; PKR/USD toggle works
   with and without a default rate.
4. Charts: tooltips on hover and keyboard focus, a table twin under each chart, colours from the `--chart-*` tokens.
5. No new console errors; screenshots saved; badge, `VERSION` and CHANGELOG bumped; artifact republished.
