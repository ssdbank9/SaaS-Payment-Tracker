# Wasooli: guide for AI coding assistants

This is the canonical working guide for any coding assistant on this repository: OpenAI Codex, Cursor, Gemini CLI,
GitHub Copilot agents, Jules, Aider, Claude Code, or a person. `CLAUDE.md`, `GEMINI.md` and
`.github/copilot-instructions.md` only point here. Read this file, then `docs/HANDOFF.md` (state, decisions, runbook).

## The one rule

**Pushing to `main` deploys to the live site within 5 minutes.** There is no staging, no CI gate and no review step.
Verify locally (below) before every push. Never force-push. To undo, revert the commit and push the revert.

## What this is

Wasooli ("Know who's paid.") is a one-owner payments tracker for people who share paid SaaS accounts
(packages such as C, C Max, G). The owner records subscribers, their plans, payments (PKR or USD), refunds and
running costs; the app works out billing periods, who is paid up or overdue, what to send on WhatsApp/email/Telegram,
and serves public choice pages (`/c/<token>`) where subscribers say continue / upgrade / discontinue.
It runs as a self-hosted Flask app on the owner's VM (`wasooli.duckdns.org`; subscriber links on `pay-up.duckdns.org`).
The same `index.html` is also published as a claude.ai artifact and works browser-locally (`localStorage`).

The owner is not a developer and uses the site mostly on a phone. Changes must work at 390px first.
Write user-facing text in plain, factual words; no emojis.

## Architecture

- `index.html`: the whole admin app in one file. Vanilla JS in an IIFE, inline CSS, light/dark themes
  (`prefers-color-scheme` plus `:root[data-theme]`), inline SVG charts, no build step, no libraries, no framework.
  Three storage backends behind one `db` shape: the self-hosted server (`/api/docs/<path>`, detected via
  `window.__PT_SERVER__`), the claude.ai artifact runtime (`window.claude`: db, downloads, sample, assets) and
  browser `localStorage` as the fallback.
- `server/`: Flask + SQLite. `app.py` (routes, `VERSION`, docs API, `/c/<token>`, `/healthz`, export/import,
  security endpoints), `auth.py` (passcode, per-IP lockout, hidden sign-in path `/x/<ADMIN_PATH>`, signed sessions),
  `db.py` (document store in `DATA_DIR/tracker.sqlite3`, `meta` table for server-side secrets),
  `notify.py` (daily reminder emails, run by a timer), `claude_read.py` / `gemini_read.py` (screenshot reading),
  `templates/` (login, neutral page, choice page).
- `deploy/`: `setup.sh` (idempotent installer: Caddy, venv, env file, systemd units), `update.sh`
  (auto-pull every 5 minutes), `backup.sh` (nightly SQLite backup), `systemd/` (units and timers).
- `assets/`: logo, mark, PNG icons, `manifest.webmanifest`, served by Flask at `/assets/<file>`.
- `README.md` (owner-facing), `CHANGELOG.md` (one entry per version, newest first),
  `docs/HANDOFF.md` (hand-off: state, decisions and why, runbook, security model, known gaps),
  `docs/setup-runbook.html` (the owner's step-by-step of how the server was built; update it when a setup step changes).

## Deploy pipeline (do not fight it)

- On the VM, `payments-tracker-update.timer` runs `deploy/update.sh` every 5 minutes: fetch, hard-reset to
  `origin/main`, reinstall requirements if `server/requirements.txt` changed, refresh the systemd units, append
  defaults for new env keys (`ensure_env`), restart `payments-tracker`. Pushing is the whole release.
- The live version is the badge in the header (`vNN`, next to the sync status) and `"version"` in
  `https://wasooli.duckdns.org/healthz`. Wait for it to change after a push before telling the owner it is live.
- `deploy/setup.sh` is idempotent and keeps every existing value in `/etc/payments-tracker.env`
  (`DOMAIN`, `LINK_DOMAIN`, `OLD_DOMAIN`, `ADMIN_PASSCODE`, `SECRET_KEY`, `ADMIN_PATH`, `SESSION_DAYS`,
  `LOGIN_GLOBAL_PER_MINUTE`, `DATA_DIR`, `COOKIE_SECURE`, `ANTHROPIC_API_KEY`, `APP_TZ`). A new key needs a
  default in code and, if the VM must pick it up, an `ensure_env` line in `update.sh`.
- Code lives in `/opt/payments-tracker` (disposable); data in `/var/lib/payments-tracker`
  (`tracker.sqlite3`, `backups/`, uploaded receipts).

## Data model essentials

- Documents keyed by path: `settings/main`, `users/<id>`, `costs/<id>`, `meta/*`, `confirm/<token>`.
- `settings/main`: `rate` (default PKR per USD), `packages` `[{id,name,cycle,price,currency,description}]`,
  `anchor` + `cycleDay` (the shared billing cycle), `remindDay`, `replyDay`, message templates,
  `appName`, `tagline`, `publicBaseUrl`, `waApp`, `dimSettled`. AI and mail settings live server-side in `meta`.
- User: `name, email, phone, telegram, joinDate, notes, subscriptions[], reminders{}, cancel, cancelHistory[],
  discontinue, confirmToken`.
- Subscription (plan): `kind` monthly|one-time, `cycle` monthly|yearly, `packageId`, `currency`, `start`, `end`,
  `prorate`, `waiveFirst`, `prices[{from,price}]`, `discount`, `dueBy`,
  `tierHistory[{from,packageId,price,currency,note,via}]` (C and C Max switches from a cycle start),
  `periodOverrides{periodStart:{amount?,packageId?,note,at,fromRefund?}}` (hand-set amount and/or package for one period),
  `payments[{id,date,amount,currency,rate,note}]`,
  `refunds[{id,date,amount,currency,rate,note}]` (v28; absent = none). One-time items have `total` and `due`.
- Recording a payment (v29, extended v30): `recTarget(s, sa, st)` builds the question for a period box (`st` = its cycle start;
  default the period that needs money next; `'item'` for a one-time item). For the next-due period it is one payment of what that
  period still owes; for a later unpaid / upcoming period it is one payment per period from the next-due one through it (`coverPlan`;
  credit is applied in period order, so money cannot skip a month), the same thing Paid up to… records. `recBoxHTML` draws it
  ("Record Rs 4,200 for 24 Oct – 23 Nov?" or "Record 2 payments totalling Rs 8,400 for Sep and Oct?", Yes / Different amount / Not now);
  `recPayments` turns a multi-period answer into `[{date,amount,currency,rate:null,note}]`; `recordPayment(id, sid, payOrList)` appends and
  saves through `persistUser`, which puts the user into `state` and renders at once on every backend (do not wait for the poll).
  `recNoneHTML` is the box for a plan with nothing owed (ended / paid ahead). Paid up to… (`uptoForm`) shows the same question after the
  cycle is picked (`data-act="upto-yes"`); its total / date / note fields sit behind Different amount. The older `.pay-form` is only for
  editing a payment. Status pills come from `statusLabel(a)` with `periodMonth(st, en, cycle)` ("Paid for Oct", "Paid to Nov",
  "Overdue for Sep – Oct", "Paid for 2026–27"); a user analysis carries `statusA`, the plan that set its status.
- Due dates (v30): a plan analysis has `nextSt` (the cycle start of the period that needs money next; the key for period boxes,
  `periodOverrides` and lookups) and `nextDue` (the day money is due: `max(nextSt, s.start)`, so a plan started or resumed mid-cycle
  is due on its start date). `pFrom(p)` / `perLabel(p)` give the day a period is billed from (its `es` when prorated or waived).
  Never compare `nextDue` with a period's `st`; use `nextSt`.
- Accounts (v31): `analyze(u)` returns `accounts[{sid,pid,base,ov,per}]`, one per plan still running (monthly or yearly, not ended;
  none for a cancelled user; one-time items are not accounts, `oneOpen` counts those still being paid). `pid` is the package the
  current period is billed as (`curP.pkgId`: tier switch or one-month package). `acctHTML` draws the row's "3 accounts [C ×2] [G]",
  `accountSummary` the Active accounts bar, and `breakdownRows` takes its Users per package from the same list.
- Periods are computed, never stored. `paidInPlanCur` is payments minus refunds (the plan's credit);
  `analyzeMonthly` walks cycle periods from `pStart`, applies that credit in order and yields
  paid/partial/unpaid/upcoming states, balance and next due. `analyze(u, today)` aggregates a user.
  `breakdownRows`, `monthlySeries`, `cumulativeSeries` and `analyticsData` build the Summary and Analytics figures
  from the same functions, so numbers reconcile by construction. Net is `netSum(collected, refunds, costs)`.
  Reuse these; do not recompute money elsewhere.
- Refunds (v28): revenue in a month is its payments minus its refunds (by refund date); a refund is attributed to the
  plan's package on the refund date. `monthlySeries` returns `col` (paid in), `ref` and `colNet` (= col − ref, the bars both charts
  draw, v30). A refund on a one-time item lowers the item's total (v30: `analyzeOneTime` returns `total` = listed − refunded, `listed`,
  `refunded`; `paid` is what was kept); a refund on a monthly plan makes the month owed again. For a cancelled user, `settleRefunds` sets `periodOverrides` marked
  `fromRefund` so a period a refund made short counts at what was kept; those entries are derived and re-computed
  whenever a refund is saved or removed.
- Costs: `date, description, category, packageId ('' = shared), currency, cost, tax, rate, receipt, source`.
- Migrations (`maybeSeedShared`, the migrate block, `SCHEMA` in `index.html`) are lease-guarded via `meta/*` and
  idempotent: add fields with defaults, treat an absent field as the default, never overwrite or delete owner-entered
  records. Most new features need no migration (absent = default).
- `todayISO()` honours `localStorage['pt-today']` (tests); the server's notify job honours `WASOOL_TODAY`.

## Conventions

- Every code change bumps three things together: the badge (`id="app-ver"` in `index.html`, text `vNN`),
  `VERSION = "NN"` in `server/app.py`, and a `## vNN - date` entry at the top of `CHANGELOG.md` in plain words.
  Docs-only changes do not bump.
- The repo `index.html` and the claude.ai artifact (`https://claude.ai/artifact/TirjtbYSsbjrMweoV3P4PA`) are kept
  identical. Only Claude can republish the artifact; other tools leave it alone and note that it is behind.
- Style: keep the single-file, no-dependency approach; CSS tokens on `:root` with dark overrides in both dark blocks;
  new UI reuses `.panel`, `.tile`, `.brk`, `.seg`, `.chart-box`, `.pay-row`; comments say which version added what.
- Git: commit straight to `main`, imperative summary ending in `(vNN)`, short body; no PRs unless the owner asks.

## Never do

- Never reset, re-seed, edit or delete records in the owner's data as part of a code change, and never run SQL
  against the VM's database except to read.
- Never rename env keys, systemd unit names, URL paths (`/api/docs`, `/c/<token>`, `/x/<path>`, `/healthz`),
  data paths, document paths or the units stored in them (amounts in the plan's currency, rates as PKR per USD).
- Never force-push or rewrite `main`; the VM hard-resets to `origin/main`, so history is the audit trail.
- Never split `index.html` into several files or add a build step, framework or CDN library.
- Never put secrets in the repository: passcodes, `SECRET_KEY`, `ADMIN_PATH` values, API keys, SMTP passwords.
- Never push without the local check below.

## Running locally

Needs Python 3.10+ and, for the browser check, Node 18+ with Playwright.

```bash
python3 -m venv venv && venv/bin/pip install -r server/requirements.txt
DATA_DIR=/tmp/wasooli-data ADMIN_PASSCODE=test1234 SECRET_KEY=x COOKIE_SECURE=0 \
  venv/bin/python -c "import sys; sys.path.insert(0,'server'); import app; app.app.run(port=8098)"
# sign in at http://127.0.0.1:8098/login with test1234; the page seeds sample users on an empty store
```

With no `ADMIN_PATH` set (or one shorter than 16 characters) the sign-in form is at `/login`; set a 16 to 80
character `ADMIN_PATH` to test the hidden `/x/<ADMIN_PATH>` address. Delete `DATA_DIR` to start from the sample
data again. Opening `index.html` directly as a file also works (browser-local storage, same sample data).

Browser check with Playwright (Node): `npm i -D playwright && npx playwright install chromium` in a scratch folder
(not in this repo), then launch Chromium, sign in, and pin the date with an init script:
`localStorage.setItem('pt-today','2026-09-25')`. Collect `console` errors and `pageerror` events.

Known, harmless console noise: Google Fonts blocked in an offline sandbox, `/api/read-image` 501 (no AI key),
first-load 404s for `settings/main` and `meta/seed` on an empty store.

If you are running in Claude's cloud sandbox: Playwright is preinstalled; `require('/opt/node22/lib/node_modules/playwright')`,
launch with `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'` and
`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`; do not run `playwright install` there.

## Checklist for a UI change

1. 1400px and 390px viewports, light and dark (`colorScheme: 'dark'`): nothing clipped, no horizontal page scroll,
   labels legible, tables scroll inside `.table-wrap`, buttons reachable on the phone.
2. Panels: a new view opens from the header, closes, and hides the others (`showPanel`).
3. Money: totals match the Summary tiles and the By product table for the same range; PKR/USD toggle works with
   and without a default rate; a refund lowers Net by exactly its amount in its month.
4. Charts: tooltips on hover and keyboard focus, a table twin under each chart, colours from the `--chart-*` tokens.
5. No new console errors; badge, `VERSION` and CHANGELOG bumped; `node --check` passes on the extracted script.

## After pushing

Check the badge or `/healthz` shows the new version (up to 5 minutes), then tell the owner what changed in one or two
plain sentences and how to undo it ("revert the last commit").
