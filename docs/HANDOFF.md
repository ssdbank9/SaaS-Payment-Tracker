# Wasooli hand-off

Written 2026-09-23 at v26, updated 2026-09-26 at v29. This is the document to read first when picking the project
up again in Claude Code, another AI coding tool or by hand. `AGENTS.md` is the working guide for a coding session
(every tool reads it, see section 10); this file records the state, the decisions and why they were made. The owner-facing step-by-step of how the server was
built is `docs/setup-runbook.html` (open it in a browser; it prints).

## 1. Purpose and who

- **What:** Wasooli ("Know who's paid.") tracks subscribers who share paid SaaS accounts (packages C, C Max
  and G), their billing periods, payments in PKR or USD, running costs, and what to send them on WhatsApp,
  Telegram or email. Subscribers answer on a private link (`/c/<token>`): Continue, Upgrade to C Max, or
  Discontinue.
- **Owner and only user:** Aly Jafferani (Karachi, UTC+5). One passcode, one admin. Not a multi-tenant product.
- **Built by:** Claude in a Slack thread on 2026-09-21..23 (v1 to v26 in three days). The owner is leaving
  Slack; future work happens in Claude Code at claude.ai/code connected to the GitHub repo.
- **Repo:** `ssdbank9/SaaS-Payment-Tracker` on GitHub, branch `main`. Pushing to `main` is the release.

## 2. Current state (2026-09-26, v29)

| Item | Value |
| --- | --- |
| Admin site | `https://wasooli.duckdns.org` (plain root shows a blank neutral page on purpose) |
| Sign-in form | `https://wasooli.duckdns.org/x/<ADMIN_PATH>` (printed by the installer; Settings → Security) |
| Subscriber links | `https://pay-up.duckdns.org/c/<token>` (`LINK_DOMAIN`) |
| Health check | `https://wasooli.duckdns.org/healthz` → `{"ok": true, "app": "wasooli", "version": "29", "linkBase": "https://pay-up.duckdns.org", ...}` |
| VM | Oracle Cloud Always Free, `VM.Standard.A1.Flex`, 1 OCPU / 6 GB, Ubuntu 24.04 aarch64, public IP `141.145.157.7`, created 2026-09-22 ~11:45 UTC in VCN `vcn-20260922-1643` / subnet `subnet-20260922-1643` |
| Cloud firewall | Default Security List of that subnet: default rules (TCP 22, ICMP) plus TCP 80 and TCP 443 from `0.0.0.0/0` added by the owner |
| DNS | DuckDNS (owner signed in with Google): `wasooli.duckdns.org` and `pay-up.duckdns.org` → `141.145.157.7`. The first name `wasool.duckdns.org` was deleted on 2026-09-23 |
| SSH | `ssh -i "$env:USERPROFILE\Downloads\ssh-key-2026-09-22.key" ubuntu@141.145.157.7` from Windows PowerShell |
| Code on VM | `/opt/payments-tracker` (a git checkout of `main`; disposable) |
| Data on VM | `/var/lib/payments-tracker/tracker.sqlite3` plus `assets/` (uploaded receipts) and `backups/` |
| Secrets on VM | `/etc/payments-tracker.env` (`DOMAIN`, `LINK_DOMAIN`, `OLD_DOMAIN`, `ADMIN_PASSCODE`, `SECRET_KEY`, `ADMIN_PATH`, `SESSION_DAYS`, `DATA_DIR`, `COOKIE_SECURE`, `ANTHROPIC_API_KEY`, `APP_TZ`); AI and mail keys typed in Settings live in the SQLite `meta` table |
| Services | `payments-tracker.service` (gunicorn on 127.0.0.1:8080), `caddy` (HTTPS for all three hosts), timers `payments-tracker-update` (5 min), `payments-tracker-backup` (03:15 daily), `payments-tracker-notify` (04:00 UTC = 09:00 PKT daily) |
| Versions | badge `v29` in `index.html`, `VERSION = "29"` in `server/app.py`, top entry `## v29` in `CHANGELOG.md` |
| Repo head | the v29 commit "v29: one-tap Record payment and Paid-for-month dashboard labels" (check with `git log -1`) |
| claude.ai artifact | `https://claude.ai/artifact/TirjtbYSsbjrMweoV3P4PA`: same `index.html`, kept identical in code, but retired as the place where data lives |

**How updates deploy.** `payments-tracker-update.timer` runs `deploy/update.sh` every 5 minutes: `git fetch`,
hard-reset to `origin/main` if it moved, reinstall requirements if `server/requirements.txt` changed, refresh
the systemd units, append defaults for new env keys (`ensure_env`), restart the service. Nothing else is
needed; the version badge in the header shows when the new copy is live.

## 3. Architecture (one page)

```
phone / PC browser ──HTTPS──▶ Caddy (:443, certs from Let's Encrypt)
                              │  hosts: wasooli.duckdns.org, pay-up.duckdns.org (+ OLD_DOMAIN redirect)
                              ▼
                     gunicorn 127.0.0.1:8080  → server/app.py (Flask)
                              │   auth.py   passcode, per-IP lockout, /x/<ADMIN_PATH>, signed sessions
                              │   db.py     SQLite document store  /var/lib/payments-tracker/tracker.sqlite3
                              │   notify.py daily reminder emails (timer)
                              │   gemini_read.py / claude_read.py  screenshot reading
                              ▼
                        index.html  (the whole admin app, one file, vanilla JS, inline CSS/SVG)
```

- `index.html` is the entire admin UI. It detects its backend: the server (`window.__PT_SERVER__`, docs API at
  `/api/docs/<path>`), the claude.ai artifact runtime (`window.claude`), or `localStorage`. All three present
  the same `db` shape to the app code.
- The server is a thin document store plus a few special endpoints: login, `/c/<token>` choice pages (rendered
  server-side from `confirm/<token>` documents), `/api/confirmations`, `/api/export` and `/api/import`,
  receipt upload (`POST /api/assets`, served back at `/blob/<id>`), AI settings/reading/test, mail settings/test, security
  (`/api/security`, regenerate path, sign out everywhere), `/assets/<file>` and `/manifest.webmanifest`.
- Host-based routing (v25): on `LINK_DOMAIN` only `/c/<token>`, `/assets/*`, `/healthz` and the manifest exist;
  everything else is the neutral 404. On `DOMAIN` `/c/<token>` redirects to the link domain. `OLD_DOMAIN`
  redirects to `DOMAIN`.
- No build step, no JS libraries, no framework. Fonts (IBM Plex Sans) from Google Fonts; everything else inline.

## 4. Data model

SQLite tables (`server/db.py`): `docs(path, json, updated_at)`, `confirmations`, `audit`, `login_attempts`,
`meta(key, value)`. The app's data is JSON documents in `docs`, keyed by path.

**Documents**

- `settings/main`: `rate` (PKR per USD, default 280), `packages[{id,name,cycle,price,currency,description}]`
  (defaults `pkg_c` C monthly Rs 4,200, `pkg_cmax` C Max monthly, `pkg_g` G yearly), `anchor` (default
  `2026-07-24`) and `cycleDay` (24; every cycle start is that day clamped to the month), `remindDay` (20),
  `replyDay` (23), `prorationBasis` (`fixed30` | `actual`), `template`, `finalTemplate`, `queueTemplates{1,2,3}`,
  `payHow`, `appName`, `tagline`, `readModel`, `publicBaseUrl` (ignored while `LINK_DOMAIN` is set), `waApp`
  (`regular` | `business` | `ask`), `dimSettled`.
- `users/<id>`: `name, email, phone, telegram, joinDate, notes, subscriptions[], reminders{}, cancel,
  cancelHistory[{lastDay,reason,note,at,resumedOn,resumedAt}] (v27, resumed cancellations), discontinue, confirmToken`.
  - Subscription (plan): `id, kind` (monthly | one-time), `cycle` (monthly | yearly), `packageId`, `currency`,
    `start`, `end`, `prorate`, `waiveFirst`, `prices[{from,price}]`, `discount`, `dueBy`,
    `prorationBasis|DaysOverride|RateOverride|AmountOverride` (older per-plan overrides, still read),
    `tierHistory[{from,packageId,price,currency,note,via}]` (C ↔ C Max from a cycle start),
    `periodOverrides{periodStart:{amount?,packageId?,note,at}}` (hand-set amount and/or package for one period, v27; absent = computed),
    `payments[{id,date,amount,currency,rate,note}]`, `refunds[{id,date,amount,currency,rate,note}]` (v28; absent =
    none). One-time items carry `total` and `due`. A `periodOverrides` entry marked `fromRefund` is derived by
    `settleRefunds` (a cancelled user's period that a refund made short counts at what was kept) and is recomputed
    whenever a refund is saved or removed.
  - `reminders{}` holds per-cycle ticks: reminded, confirmed, final notice, Except list, and Queue `sent`
    records `{stage, cycleStart, channel, at}`.
- `costs/<id>`: `date, description, category, packageId` (`''` = shared), `currency, cost, tax, rate, receipt,
  source`.
- `confirm/<token>`: the per-cycle card the admin page writes so the server can render `/c/<token>` (first
  name, plans, tier, amount, dates). Written whenever the Queue or Reminder run renders.
- `meta/schema`, `meta/seed`: migration markers with a lease (`acquire` with a TTL) so two tabs never migrate
  at once.
- `meta` table (server-side only, never exported): `admin_path`, `secret_version`, `mail` (SMTP incl. app
  password), `ai` (provider, keys, Gemini model), `docs_version`.

**Periods are computed, never stored.** `analyzeMonthly` walks cycle periods from the plan start, applies
payments minus refunds as credit in order and yields paid / partial / unpaid / upcoming, balance and next due.
Since v29 `analyze(u, today)` also returns `statusA`, the plan analysis whose status the user's pill shows;
`statusLabel` / `statusHint` / `periodMonth` turn a plan or user analysis into "Paid for Oct" and its tooltip, and
`recTarget(s, sa)` is the one period (or one-time remainder) the Record payment question is about. `analyze(u,
today)` aggregates a user. `breakdownRows`, `monthlySeries` and `analyticsData` build Summary and Analytics
from those same functions, so totals reconcile by construction. Any new money figure must reuse them.
Since v28 revenue in a month is its payments minus its refunds (by refund date) and Net = collected − refunds − costs
(`netSum`); a refund is counted for the plan's package on the refund date.

**Migration rule.** `SCHEMA = 11` in `index.html`. `maybeSeedShared` seeds an empty store; the migrate block
upgrades an old one. Both are lease-guarded via `meta/schema`, write settings first and the marker last, are
idempotent, add fields with defaults, treat an absent field as the default and never overwrite or delete
owner-entered records. Schema 11 (v18) pinned the fixed 30-day basis and reconciled the seeded users to the
owner's real records. New versions since v18 have needed no migration (absent = default).

## 5. Version history

| v | Date | What | Decision behind it |
| --- | --- | --- | --- |
| 1 | 09-21 | Users, monthly payments, WhatsApp payment links | Start as one HTML file: no hosting needed to try it |
| 2 | 09-21 | Billing periods, names, one-time items, balance due; 7 seeded users | Owner's real subscribers from day one |
| 3 | 09-21 | Packages per user | Subscribers hold different products |
| 4 | 09-22 | USD and PKR at a default rate of 280; costs and net | Owner pays vendors in USD, collects in PKR |
| 5 | 09-22 | Screenshot import of costs | Statements arrive as pictures |
| 6 | 09-22 | Packages C, C Max, G; filter; per-package breakdown | The three real products |
| 7 | 09-22 | Cycles monthly / yearly / one-time; shared anchor 24 July 2026; proration; credit carry-forward; Reminders panel (20th / 23rd) | Everyone bills 24th–23rd; late joiners pay by days |
| 8 | 09-22 | Uqba seed removed by guarded migration; Quick add from pasted text; compact Add user | Never re-add a removed record |
| 9 | 09-22 | Email one-tap; cancel / reactivate flow; status filter | Not every subscriber uses WhatsApp |
| 10 | 09-22 | Telegram field; contact migrations | Some subscribers are on Telegram |
| 11 | 09-22 | Second monthly plan per user; waive first partial period | Haroon has two C accounts |
| 12 | 09-22 | Final notice step, not-confirmed list, CSV of deactivations | The 23rd is the cut-off |
| 13 | 09-22 | Paid up to; Except list | Prepayments and skipping people for a cycle |
| 14 | 09-22 | Proration basis (fixed 30 / actual), editable prorated periods, per-plan discount | Owner uses a fixed 30-day month |
| 15 | 09-22 | Named Wasool; self-hosted Flask + SQLite server, passcode login, confirmation links, JSON export/import, `deploy/setup.sh` | Phone must work when the desktop is off; data on the owner's own VM |
| 16 | 09-22 | (no CHANGELOG entry; the v15 work landed as several commits: server, frontend, deploy, docs) | — |
| 17 | 09-22 | Contact details in rows; Home toggle; distinct expanded card | Readability on the phone |
| 18 | 09-22 | Seed and schema 11 match the owner's real records; settings-first marker-last fix | A half-run seed left a store with no proration basis |
| 19 | 09-22 | Per-account plan boxes; C ↔ C Max tier switch with `tierHistory` | Upgrades happen mid-life from a cycle start |
| 20 | 09-22 | Subscriber choice page (Continue / Upgrade / Discontinue), answers applied once, Queue with three stages, SMTP settings and daily notify timer | One-tap answers instead of chasing replies; silent users continue from the 24th |
| 21 | 09-22 | Costs per product; AI key in Settings; billing day setting (`cycleDay`); WhatsApp app choice; currency on add | Net per product; links kept opening WhatsApp Business |
| 22 | 09-22 | Editable amount per period (`periodOverrides`) with note and discount shortcut | Eid discounts and corrections without touching payments |
| 23 | 09-22 | Google Gemini as reading provider with model picker (Flash-Lite preselected); pictures read on pick | Owner has a Gemini key, not an Anthropic one |
| 24 | 09-23 | Renamed Wasooli with logo and icons; period tiles wrap on phones; retroactive-edit warning; dimmed settled rows | "wasool" was taken / awkward; unpaid rows must stand out |
| 25 | 09-23 | Per-IP lockout, hidden sign-in path, 90-day sessions, `LINK_DOMAIN` | A stranger could lock the owner out; links carried the admin domain |
| 26 | 09-23 | Analytics tab; `CLAUDE.md`; README "Making changes" | Owner asked for graphs of users per package and money vs cost, and a way to change the site himself |
| 27 | 09-25 | One month on another package; Paid up to → Clear; Cancel reachable on phones; Resume with a date and cancellation history | Owner bills single months as C Max; iPhone date pickers cannot clear; the Cancel button was off-screen |
| 28 | 09-25 | Refunds (reduce revenue, net and the plan's credit; optional cancel; shown in history); `AGENTS.md` for any AI tool | Owner wants exact revenue and profit after money given back, and to continue with Codex or other tools |
| 29 | 09-26 | One-tap Record payment (question on the period box, big Yes, Different amount); every save redraws at once; same-day payments both kept; status pills say "Paid for Oct" / "Paid to Nov" / "Overdue for Sep – Oct" | Owner found recording a payment counter-intuitive (edit → save → record, and Paid appearing late) and wanted the dashboard to name the month |

## 6. Decisions log

| Decision | Date | Why | Alternatives rejected |
| --- | --- | --- | --- |
| Single `index.html`, no build, no libraries | 09-21 | Runs anywhere (artifact, file, server); one file to reason about | React/Vite app; separate CSS/JS files |
| Shared billing anchor on the 24th (24th–23rd), reminder day 20, reply-by 23 | 09-22 | Matches how the owner already bills | Per-user anniversaries |
| Fixed 30-day proration basis (Rs 4,200 / 30 = Rs 140 a day) | 09-22 | Owner's existing arithmetic (Ataullah 23 days = Rs 3,220) | Actual days in the cycle (kept as an option) |
| PKR/USD default rate 280, stored per payment | 09-22 | Stable reporting; old payments keep their rate | Live FX lookup |
| Self-host on Oracle Always Free, Ubuntu arm64, Caddy, Flask, SQLite | 09-22 | Rs 0, phone works when the desktop is off, data stays with the owner | Keep claude.ai artifact as the data store; paid VPS; Postgres |
| DuckDNS names instead of a bought domain | 09-22 | Free, two minutes, no card | Buying a `.com`/`.pk` (still possible: re-run installer with new `DOMAIN`) |
| Passcode only, no authenticator app | 09-23 | Owner refused an authenticator; hidden path + per-IP lockout + 90-day sessions give the protection needed | TOTP; passkeys; OAuth |
| Lockout per IP (8 in 15 min), global brake 60/min | 09-23 | v24 locked everyone after 8 failures, so a stranger could lock the owner out | Global lockout (v24); CAPTCHA |
| Hidden sign-in address `/x/<ADMIN_PATH>`; plain root blank | 09-23 | Strangers who reach the domain see nothing to attack | Basic auth in Caddy; IP allow-list (owner's IP changes) |
| Separate link domain `pay-up.duckdns.org` | 09-23 | Subscribers' links no longer reveal the admin address | Same domain for both |
| One-tap message queue (WhatsApp / Telegram / email) instead of the Meta WhatsApp API | 09-22 | No business verification, no cost, owner sends from his own number | WhatsApp Cloud API; Twilio |
| Subscribers answer via `/c/<token>`: Continue / Upgrade to C Max / Discontinue | 09-22 | One tap on a phone; answers are applied to records once | Reply by text and parse it |
| "Account continues from the 24th" for silent users | 09-22 | Owner's policy: silence means continue | Auto-cancel on silence |
| Gemini Flash-Lite for screenshot reading; key stored server-side | 09-22 | Owner has a Google AI Studio key; cheapest vision model | Anthropic Haiku (still supported as provider) |
| Costs tagged per product (`packageId`, `''` = shared) | 09-22 | Net per package in Summary and Analytics | One global cost pool |
| Everything editable in place, works on the phone | 09-22 | Owner runs it from the phone | Desktop-only admin |
| Data lives only on the server; artifact retired as a store but kept identical in code | 09-23 | One source of truth; the artifact stays a demo | Two-way sync |
| Future changes through Claude Code connected to the repo; VM self-updates | 09-23 | Owner does not edit code; pushing is deploying | Manual `git pull` on the VM; CI pipeline |
| Slack routines (20th and 23rd nudges) left in place but ignored | 09-23 | Owner leaving Slack; the notify timer covers the emails | Deleting them (harmless either way) |
| Refund = its own record on the plan, dated when the money went back; it lowers revenue in that month and the plan's credit | 09-25 | Revenue and profit must be exact; a refunded month is no longer paid for | A negative payment (confuses the history and the payment count); lowering the period amount (hides the money that came and went) |
| `AGENTS.md` is the one guide; `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md` only point to it | 09-25 | Every AI coding tool reads one of these names; one source cannot drift | Copies of the same text per tool |
| Record payment = a yes/no question on the period that needs money next, recording exactly what that period owes; the full form only for edits | 09-26 | The owner records on a phone; the old header form (date, currency, amount, rate, note, months) plus "edit amount" on the box made him edit and save before recording | Auto-recording without a question (a mis-tap would store money); a bottom sheet (inline keeps the period in view) |
| A period is "for" the month its cycle starts in (24 Oct – 23 Nov = "Oct"); one function `periodMonth` decides | 09-26 | Matches how the owner talks about "October's payment", the reminder on the 20th and the cycle starting the 24th | Naming the month with most days (Nov); showing both dates on the pill (too wide on a phone; the dates are the tooltip) |
| Every save puts the user into `state` and renders at once (`persistUser`) | 09-26 | Waiting for the poll of `/api/version` made Save look like it did nothing for up to 4 s (30 s in a background tab) | Keep `commitUser` only for the amount form; shorten the poll |

## 7. Operations runbook

All commands run on the VM after `ssh -i "<key>" ubuntu@141.145.157.7`.

**Re-run the installer** (repair, change domain, link domain or passcode; keeps every value you omit):

```bash
curl -fsSL https://raw.githubusercontent.com/ssdbank9/SaaS-Payment-Tracker/main/deploy/setup.sh \
  | sudo DOMAIN=wasooli.duckdns.org LINK_DOMAIN=pay-up.duckdns.org ADMIN_PASSCODE='new-passcode' bash
```

**Change the passcode only:** re-run the installer with just `ADMIN_PASSCODE='...'`, or
`sudo nano /etc/payments-tracker.env`, edit `ADMIN_PASSCODE=`, then `sudo systemctl restart payments-tracker`.
Existing sessions stay valid; use **Sign out everywhere** in Settings → Security to end them.

**Rotate the sign-in address:** Settings → Security → **Regenerate** (stored in `meta.admin_path`, wins over
the env file). Bookmark the new address on every device before signing out. To see the effective one from the
shell: `sudo sqlite3 /var/lib/payments-tracker/tracker.sqlite3 "select value from meta where key='admin_path'"`
(falls back to `ADMIN_PATH` in the env file when the row is absent).

**Restore a backup:**

```bash
ls -1t /var/lib/payments-tracker/backups/            # pick tracker-YYYYMMDD-HHMMSS.sqlite3.gz
sudo systemctl stop payments-tracker
sudo cp /var/lib/payments-tracker/tracker.sqlite3 /var/lib/payments-tracker/tracker.before-restore.sqlite3
sudo sh -c 'gunzip -c /var/lib/payments-tracker/backups/tracker-YYYYMMDD-HHMMSS.sqlite3.gz > /var/lib/payments-tracker/tracker.sqlite3'
sudo chown payments-tracker:payments-tracker /var/lib/payments-tracker/tracker.sqlite3
sudo systemctl start payments-tracker
```

Or, without the shell: Settings → Your data → **Import everything (JSON)** with an export.

**Logs and status:**

```bash
sudo systemctl status payments-tracker caddy --no-pager
sudo journalctl -u payments-tracker -n 100 --no-pager        # app (lockouts show as "login: ... locked")
sudo journalctl -u caddy -n 50 --no-pager                    # certificates
sudo journalctl -u payments-tracker-update -n 30 --no-pager  # auto-update runs
sudo journalctl -u payments-tracker-notify -n 30 --no-pager  # daily emails
systemctl list-timers 'payments-tracker*' --no-pager
curl -s https://wasooli.duckdns.org/healthz
```

**Run the daily email job by hand (dry run, sends nothing):** `cd /opt/payments-tracker/server && sudo -u
payments-tracker WASOOL_TODAY=2026-10-20 /opt/payments-tracker/venv/bin/python notify.py --dry-run` (the
script honours `WASOOL_TODAY` to pretend it is another date, and `--dry-run` logs what it would send).

**Roll back a commit:** in Claude Code, "revert the last commit" (`git revert HEAD` and push), or on GitHub
open the commit and press *Revert*. The VM picks it up within 5 minutes. Never force-push; the VM hard-resets to
`origin/main`, so a rewritten history still deploys but loses the audit trail.

**Force an update now:** `sudo /opt/payments-tracker/deploy/update.sh` (what the timer runs).

**Backup off the VM:** `scp -i "<key>" ubuntu@141.145.157.7:/var/lib/payments-tracker/backups/*.gz .` needs
sudo rights on the folder (mode 750, owned by `payments-tracker`); simpler is **Export everything (JSON)** in
the app, or `sudo cp` a backup to `/home/ubuntu` first.

**If the VM's public IP changes** (only after a stop/start with an ephemeral IP, never on a reboot): update
both DuckDNS names to the new IP, then `sudo systemctl restart caddy`.

## 8. Security model

- **Public without login:** the neutral page at `/` (200, mark + "Nothing to see here."), `/healthz`,
  `/assets/*`, `/manifest.webmanifest`, `/c/<token>` on the link domain (shows only first name, package,
  amount, dates; the token is 22 random URL-safe characters per user). Every other path is the neutral 404.
- **Sign-in:** only at `/x/<ADMIN_PATH>` (24 random characters). A signed **known-device** cookie (1 year) set
  on every successful login makes `/` redirect to the sign-in page on the owner's own devices only.
- **Lockout:** 8 failures in 15 minutes lock that IP (`429`, `Retry-After`), logged with the IP; a global brake
  answers `429` when all IPs together exceed `LOGIN_GLOBAL_PER_MINUTE` (60) in a minute. Signed-in sessions
  are never affected. Client IP comes from Caddy's `X-Forwarded-For`, trusted only from localhost.
- **Sessions:** signed cookie, `SESSION_DAYS` (90), sliding renewal, HttpOnly, Secure, SameSite=Lax. **Sign
  out everywhere** bumps `meta.secret_version`, invalidating every session without touching the env file.
- **API:** `/api/*` without a session is `401` JSON; state-changing calls need the `X-Requested-With: wasool`
  header the page sends (CSRF guard). Host header must match a configured domain.
- **Secrets:** passcode, `SECRET_KEY`, `ADMIN_PATH` in `/etc/payments-tracker.env` (mode 640,
  root:payments-tracker); AI keys and the SMTP app password in the SQLite `meta` table, masked on read, never in
  exports. Nothing secret is in the repository.
- **Link domain:** links never carry the admin hostname, so a curious subscriber cannot find the sign-in page
  from a link.
- **Transport:** Caddy, HTTPS only, HSTS one year, `X-Frame-Options: SAMEORIGIN`.

## 9. Known gaps / not verified

- **Real SMTP send.** The Mail settings form, test button and `notify.py` were exercised against a local
  server, not against Gmail with the owner's app password. First real run: fill Settings → Mail, press "Send
  test email to me", then watch `journalctl -u payments-tracker-notify` on the next 20th.
- **Gemini end-to-end.** The model picker and `/api/ai-test` were tested with the API's error paths; a real key
  reading a real statement screenshot on the VM has not been confirmed by the owner in this thread.
- **Android intent links.** The `intent://send…package=com.whatsapp` links are built per the Android docs; the
  owner confirmed the wrong-app problem was solved by the phone-side "Clear defaults" and the Settings choice,
  but the intent path was not verified on his handset separately.
- **Notify timer on the VM.** `update.sh` enables every timer on each run, so
  `payments-tracker-notify.timer` should be present; confirm with `systemctl list-timers 'payments-tracker*'`.
- **v16** has no CHANGELOG entry (the v15 work landed as four commits); nothing is missing from the code.
- **Oracle "Out of capacity"** was not hit on this tenancy; the fallback in the runbook is standard advice.
- **Certificate for `pay-up.duckdns.org`** was issued when the installer was re-run with `LINK_DOMAIN` on
  2026-09-23; if it ever fails, `journalctl -u caddy` says why (usually DNS not yet pointing at the VM).
- The claude.ai artifact still exists and still works browser-locally; it is not the data store and is not
  updated automatically by the VM pipeline (republishing is a manual step for Claude, see `CLAUDE.md`). Another AI
  tool cannot republish it; it then simply lags behind the repo, which is harmless.

**Known follow-ups (not built yet)**

- A plan that starts or resumes mid-cycle shows its next due date as the cycle start rather than the date billing
  actually starts from, in places that read the cycle date.
- Record payment (v29) asks only for the period that needs money next (credit is applied in period order, so a payment cannot be
  aimed at a later month). A plan with no next period (ended) still opens the old full payment form from its header button.
  "Paid up to…" and editing a payment still use the older multi-field forms. Status pills are longer now ("Overdue for Sep – Oct"),
  which widens the Status column on the phone's scrolling table.
- The "for 24 Oct – 23 Nov 2026" note the one-tap flow writes is the period's dates at the time of recording; if the cycle day or
  the plan's start is changed afterwards, the note keeps the old dates (payments themselves are re-applied correctly).
- The link page's "Upgrade to C Max" offer ignores a month that is already billed as C Max through a period override
  (v27), so it can still offer the upgrade for that month.
- Refunds (v28): the Summary's 12-month bar chart still draws collected before refunds (refunds are in its tooltip,
  and in the Analytics net line, tables and cumulative chart). Refunding a one-time item does not lower its total: it raises
  what is left to pay; if the sale is undone, the owner also edits the item's total. A refund is counted for the plan's package on the
  refund date, not for the package a single month was billed as. For a cancelled user, "kept after refund" period
  amounts replace a hand-set amount on the same period, and they stay if the user is later resumed (they are
  recomputed, and removed, only when a refund on that plan is saved or removed while the user is cancelled).
  "Also cancel" in the refund form uses the normal cancellation, so it ends all of that user's plans.

## 10. Continuing with another AI tool

Everything a coding assistant needs is in the repository. Which file each tool reads:

| Tool | Reads | What it contains |
| --- | --- | --- |
| OpenAI Codex (CLI, IDE, cloud), Cursor, Jules, Aider, Windsurf, Zed, Amp and most others | `AGENTS.md` | the full guide |
| Claude Code (claude.ai/code, CLI) | `CLAUDE.md` | imports `AGENTS.md` (`@AGENTS.md`) plus the artifact republish note |
| Gemini CLI | `GEMINI.md` | one line: follow `AGENTS.md` |
| GitHub Copilot (chat, coding agent) | `.github/copilot-instructions.md` | one line: follow `AGENTS.md` |

If a tool does not pick up a file on its own, start the session with: "Read AGENTS.md and docs/HANDOFF.md first
and follow them." Edit `AGENTS.md` when the rules change; the other three only point to it.

**The one rule: pushing to `main` deploys.** The VM pulls `main` every 5 minutes and restarts; there is no staging
and no review step. A tool must run the local check in `AGENTS.md` (Flask + a browser pass at 390px and 1400px,
light and dark, no console errors) before it pushes, and must never force-push.

**How to hand over:**

1. Give the tool access to the GitHub repository `ssdbank9/SaaS-Payment-Tracker` with permission to push to `main`
   (Codex: connect GitHub in its settings; Cursor, Aider, Gemini CLI: clone the repo on your computer and sign in
   to GitHub there; Copilot: open the repo on github.com).
2. Describe the change in plain words, as you do with Claude. Ask it to bump the version (badge, `VERSION`,
   CHANGELOG) and to tell you the new version number.
3. **Check it is live:** after up to 5 minutes, reload the site and look at the small `vNN` badge in the header next
   to "Saved on your server", or open `https://wasooli.duckdns.org/healthz` and read `"version"`. The number must
   match what the tool told you.
4. **Roll back:** tell the tool "revert the last commit and push" (`git revert HEAD`, then `git push`), or on
   GitHub open the commit and press *Revert*. The VM picks up the revert within 5 minutes. Your data is never touched
   by a code change or a revert.

**Rules every tool must keep** (all in `AGENTS.md`): never reset, re-seed or edit the owner's data; never rename env
keys, unit names, URL paths, data paths or stored units; never force-push; keep `index.html` a single file with no
build step; bump badge + `VERSION` + CHANGELOG together; migrations only add defaults; no secrets in the repo.
When the owner reports a problem, ask for the exact message and `journalctl -u payments-tracker -n 50`.

## 11. Owner preferences

- Fact-based, plain wording; no emojis; short messages; things must work on the phone first.
- No authenticator app, no Meta WhatsApp API, no card-charging services; free tiers only.
- Everything editable in place (amounts, dates, tiers, templates, packages); nothing hard-coded that he might
  want to change.
- Wants to make changes himself by describing them (Claude Code), and to be able to undo them.
- Wants analytics: users per package, money made vs cost, outstanding, in graphs and tables (v26).
- Likes step-by-step guides with the exact commands to paste and "you're done when" checks
  (`docs/setup-runbook.html`).
