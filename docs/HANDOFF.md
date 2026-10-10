# Wasooli hand-off

Written 2026-09-23 at v26, updated 2026-10-10 at v37. This is the document to read first when picking the project
up again in Claude Code, another AI coding tool or by hand. `AGENTS.md` is the working guide for a coding session
(every tool reads it, see section 10); this file records the state, the decisions and why they were made. The owner-facing step-by-step of how the server was
built is `docs/setup-runbook.html` (open it in a browser; it prints).

The detailed owner and next-LLM guide is [`WASOOLI-FINAL-HANDOFF.md`](../WASOOLI-FINAL-HANDOFF.md).
It covers build history, billing, private recovery inventory, fresh hosting, restore procedures and the
change/release workflow, with a verified 2026-10-04 snapshot and a copyable continuation prompt.

## 1. Purpose and who

- **What:** Wasooli ("Know who's paid.") tracks subscribers who share paid SaaS accounts (packages C, C Max
  and G), their billing periods, payments in PKR or USD, running costs, and what to send them on WhatsApp,
  Telegram or email. Subscribers answer on a private link (`/c/<token>`): Continue, Upgrade to C Max, or
  Discontinue.
- **Owner and only user:** Aly Jafferani (Karachi, UTC+5). One passcode, one admin. Not a multi-tenant product.
- **Built by:** Claude in a Slack thread on 2026-09-21..23 (v1 to v26 in three days). The owner is leaving
  Slack; future work happens in Claude Code at claude.ai/code connected to the GitHub repo.
- **Repo:** `ssdbank9/SaaS-Payment-Tracker` on GitHub, branch `main`. Pushing to `main` is the release.

## 2. Current state (2026-10-10, v37)

**Independent product dates and supplier costs (v37).** All Add/Edit user and product paths expose start and cost. Edit user lists every subscription, including one-time and yearly. One-time start and due are separate; unknown legacy starts remain unknown. Supplier costs support recurring monthly/yearly profiles and one actual expense. Profiles retain dated amount/currency/rate/supplier entries, first partial rule (actual-day prorated/full/custom/free), and cycle overrides. `costRecords()` derives elapsed cycle expenses through product/user end and supplies Costs, analytics and CSV. JSON retains profiles without duplicate derived docs. Dated changes start at supplier cycle boundaries and retain earlier rates; editing/waiving one Costs row affects only that cycle. Changing start/calendar/end explicitly recalculates derived costs; removing an account removes them. Scheduled expenses are not proof of supplier cash payment; avoid entering the same expense manually. Actual expense `costId` links a normal Costs doc; account+expense use atomic `/api/import` with no replace prefixes. Local storage supports the bundle; retired artifact storage requires its separate Costs workflow. Failed-save/polling drafts remain. Customer receipts/refunds/history are retained. No owner-record corrections or migrations. See `docs/v37-verification.md` for requirements and release evidence; `tests/product-cost-flow.cjs` requires a dedicated disposable loopback store and resets synthetic users/costs.

**Focused settings saves (v36).** Product save sits beside the catalogue; nineteen general settings each
have an adjacent Save and live status. `settingGroups` defines the keys and validation for each save;
`saveSettingGroup` writes a focused PATCH, then updates local state only on success. Pending form values
are not part of other saves. Save all remains an explicit bulk action. Billing anchor saves use the saved
counterpart, and each queue message preserves the other saved stages. A failed save retains the draft;
editing during a request keeps Unsaved changes after success. Product IDs stay stable and displayed names
resolve through the catalogue. Product mobile labels replace overflowing desktop headings. No owner data
migration. `tests/settings-save-flow.cjs` checks the disposable local store, never the production database.
Release validation: 19 settings checks plus 68 existing billing/payment/start/cancellation checks passed,
with no unexpected console/page errors on initialized synthetic stores. Settings screenshots were inspected
at 390px and 1400px in light/dark; JavaScript syntax and scoped whitespace checks passed. Live health must
be checked separately after pushing. No production-record correction accompanies v36.

**Bill and refund clarity (v35).** Set bill / proration is a separate dialog beside each name, and can also
open from Record payment. Select an account and the exact billing period; a custom charge or service-date
calculation changes only that bill. Settlement explicitly keeps cash unchanged, leaves the bill owing,
adds a receipt, or corrects one existing receipt while retaining its ID and currency/rate. The preview
shows settlement, subsequent bills and real advance credit. Pending is not permission to erase cash.
Return money uses a separate dialog: cash only, reduce one bill and return money, or cancel access and
return money. Linked refunds store `billStart` and `billReduction` (plan-currency amount, fixed at save).
`billCharge` applies that reduction in both `analyzeMonthly` and `periodAmt`; existing unlinked refunds
keep the previous meaning. Editing/removing a linked refund changes/removes its reduction by derivation.
`billReductions` excludes refund reductions, avoiding classifying returned cash as a discount. No migration
or automatic owner-data rewrite. Read-only diagnosis found full stored receipts can create valid advance
credit after an automatic first-bill proration; owner corrections must use the explicit previewed form.
`tests/billing-clarity-flow.cjs` uses a disposable local store only.

**Cancellation (v34).** Cancel subscription has No bills from billing month plus an inclusive last access day,
with a balance preview. Selecting September stops bills from September 24 and sets the last day to September 23.
Cancelled users have Edit cancellation; saving preserves cash history and separately ended plans, recalculates
derived refund settlements, and excludes plans starting after the cutoff. Genuine unpaid earlier bills remain
due. Existing owner records are not edited automatically. Tests: `node tests/cancellation-flow.cjs` uses a
disposable local server; never run it against owner data. A cutoff correction is an explicit owner action.

| Item | Value |
| --- | --- |
| Admin site | `https://wasooli.duckdns.org` (plain root shows a blank neutral page on purpose) |
| Sign-in form | `https://wasooli.duckdns.org/x/<ADMIN_PATH>` (printed by the installer; Settings → Security) |
| Subscriber links | `https://pay-up.duckdns.org/c/<token>` (`LINK_DOMAIN`) |
| Health check | `https://wasooli.duckdns.org/healthz`; v35 returned `ok: true`, `docs_version: 588` and `version: "35"` after the release on 2026-10-05, with an empty `linkBase`. |
| VM | Oracle Cloud Always Free, `VM.Standard.A1.Flex`, 1 OCPU / 6 GB, Ubuntu 24.04 aarch64, public IP `141.145.157.7`, created 2026-09-22 ~11:45 UTC in VCN `vcn-20260922-1643` / subnet `subnet-20260922-1643` |
| Cloud firewall | Default Security List of that subnet: default rules (TCP 22, ICMP) plus TCP 80 and TCP 443 from `0.0.0.0/0` added by the owner |
| DNS | DuckDNS (owner signed in with Google): `wasooli.duckdns.org` and `pay-up.duckdns.org` → `141.145.157.7`. The first name `wasool.duckdns.org` was deleted on 2026-09-23 |
| SSH | `ssh -i "$env:USERPROFILE\Downloads\ssh-key-2026-09-22.key" ubuntu@141.145.157.7` from Windows PowerShell |
| Code on VM | `/opt/payments-tracker` (a git checkout of `main`; disposable) |
| Data on VM | `/var/lib/payments-tracker/tracker.sqlite3` plus `assets/` (uploaded receipts) and `backups/` |
| Secrets on VM | `/etc/payments-tracker.env` (`DOMAIN`, `LINK_DOMAIN`, `OLD_DOMAIN`, `ADMIN_PASSCODE`, `SECRET_KEY`, `ADMIN_PATH`, `SESSION_DAYS`, `DATA_DIR`, `COOKIE_SECURE`, `ANTHROPIC_API_KEY`, `APP_TZ`); AI and mail keys typed in Settings live in the SQLite `meta` table |
| Services | `payments-tracker.service` (gunicorn on 127.0.0.1:8080), `caddy` (HTTPS for all three hosts), timers `payments-tracker-update` (5 min), `payments-tracker-backup` (03:15 daily), `payments-tracker-notify` (04:00 UTC = 09:00 PKT daily) |
| Versions | badge `v37` in `index.html`, `VERSION = "37"` in `server/app.py`, top entry `## v37` in `CHANGELOG.md`; verify health after release |
| Repo head | the v37 product starts and supplier costs change (check with `git log -1`); the earlier v36 release is `a36d159` |
| claude.ai artifact | `https://claude.ai/artifact/TirjtbYSsbjrMweoV3P4PA`: retired as the data store; v33 was edited in Codex and has not been republished there |

**How updates deploy.** `payments-tracker-update.timer` runs `deploy/update.sh` every 5 minutes: `git fetch`,
hard-reset to `origin/main` if it moved, reinstall requirements if `server/requirements.txt` changed, refresh
the systemd units, append defaults for new env keys (`ensure_env`), restart the service. Nothing else is
needed; the version badge in the header shows when the new copy is live.

**The owner's payment flow (v32).** Every ordinary month is the 24th through the next 23rd. A person who joins on
10 Oct at Rs 4,200/month has a first bill of Rs 1,960 for 10–23 Oct on the default 30-day basis, then a full Rs 4,200
bill from 24 Oct. Add user previews both and opens a receipt form after saving. Received on is the day cash arrived;
it does not change the joining date or prorate a later bill.

Record month payment is beside each person's name. Choose the account and Pay through billing month, review the
dates, charge, existing advance credit and amount left, then save the actual receipt. Older unpaid months are included
and named when choosing a later month, preserving the existing credit rule. Edit in receipt history shows current and
resulting period coverage, Total paid and Paid through before saving. Total paid is cash received minus refunds;
Discounts / reductions is a separate total for monthly bills already started or prepaid. A charge change does not add
cash. In the owner's screenshot example Rs 8,400 already received covers the Rs 3,220 first bill, Rs 4,200 next bill and
Rs 980 advance credit; the next receipt is Rs 3,220 and raises Total paid to Rs 11,620.

The receipt dialog lives outside the redrawn table. Currency, exchange rate and note expand when needed; unsaved
values survive a poll, and failed saves keep the form for retry. No new schema or data migration was introduced.

**Package starts and annual installments (v33).** Package start / payments is beside each name and Change start / payments
is beside each expanded plan's start. Choose the account and its own start date. It is independent of the person's joining date
and cash receipt dates; Add user and Add plan show both the first and following full bill before saving. The focused start form
preserves all receipts, refunds, price history, custom period charges and the person's joining date. Its preview shows the bill,
balance and paid-through changes before Save. The full plan Edit also preserves historical price entries when a start moves.

G keeps its annual stored price and can collect monthly, every 3 months, every 6 months or yearly. `installmentPrice` splits the
annual price, with rounding balanced so a full year totals the annual price. A first partial installment is prorated by actual days
for new annual plans or an explicit initial start/proration edit. Monthly plans keep the existing fixed-30-day default. Existing
annual plans without payment choices remain yearly and keep their old proration until edited. `paymentEvery` sets the initial
interval; dated `paymentSchedule` entries change it from a billing boundary. A plan with receipts defaults to changing from its
next bill; an explicit Package start option recalculates earlier charges. Dated schedule entries and custom charges retain their
dates, and the preview names them. A future-only schedule change preserves earlier calculations. Ordinary receipts still fill
the oldest unpaid bill first, regardless of their cash dates, with no stored allocation or invented receipt.

Periods carry their payment interval in `months`, so labels, status, dues, credit, Summary/Analytics and receipt choices use the
same schedule while `subCycle` and prices remain annual. Subscriber cards include only bills actually starting on that 24th and
carry individual period dates; the notifier reads those cards. `settingsLoaded` prevents an early reload from quoting a bill with
provisional proration settings. The new dialog sits outside the redrawn table and keeps failed/unfinished saves for retry.

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
    `paymentEvery` (1|3|6|12 months for annual-priced plans, v33; absent = 12),
    `paymentSchedule[{from,months}]` (v33; dated interval changes, absent = none),
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
Since v32 `paymentTarget(s, sa, k)` uses `coverPlan` to total the unpaid periods through the chosen month.
`receiptAllocations` derives coverage for the receipt-edit preview from cash records; it never stores or rewrites allocations.
`analyze(u, today)` aggregates a user. `breakdownRows`, `monthlySeries` and `analyticsData` build Summary and Analytics
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
| 30 | 09-26 | Mid-cycle / resumed plans show the real due date (plan start, not cycle start); link page offers no upgrade for a cycle already billed as C Max by hand; Summary and Analytics bars are collected after refunds; a refund lowers a one-time item's total; Record payment on every unpaid / upcoming box (a later box = one payment per period), ended plans get the short box, Paid up to… asks "Record N payments totalling Rs X (Aug, Sep and Oct)?"; long pills wrap on phones | Owner asked for the five open follow-ups from v27–v29 in one go |
| 31 | 09-26 | Each user row shows its active accounts and packages ("3 accounts · C ×2 · G"); an Active accounts bar under the tiles counts accounts per package and filters the list by package; By product / Analytics users per package come from the same accounts | Owner asked to see on the front page how many accounts each person has and which category. One-time items are not accounts (shown as "+ 1 one-time"); a month billed as C Max counts as C Max |
| 32 | 10-04 | Main-row month receipt form; first-bill preview when adding a user; separate cash date; receipt-edit coverage and cash-total preview; discounts shown separately; unsaved form survives polling | Owner wanted the front screen to record a month clearly, show what an edited payment covers, keep proration to the joining period and reconcile actual receipts with discounts |
| 33 | 10-04 | Dashboard controls for independent package starts; first and next bill previews on new packages; annual prices with monthly/3-month/6-month/yearly payments; future schedule changes and explicit initial recalculation; billing-settings readiness | Owner wanted a separate start for every package and confirmed G stays annual but may be collected in installments |

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
| A prorated first period is due on the plan's start date (`nextDue` = `max(cycle start, plan start)`); its cycle start stays the key (`nextSt`, `periodOverrides`) and its month name ("for Aug") | 09-26 | Money cannot be due before the plan exists; full periods keep their cycle start, so the rule is one line and the boxes, pills, questions and reminders agree | Showing the cycle start everywhere (v29 behaviour, wrong for the owner); renaming the month after the plan start (would make "Sep – Sep" for two owed periods) |
| A refund on a one-time item lowers the item's total (undoes that much of the sale); a refund on a monthly plan makes the month owed again | 09-26 | A refunded one-time sale is not owed again; the owner otherwise had to edit the total by hand. Monthly service was delivered, so the month is owed | Same rule for both (a refunded item showed as overdue); a "sale undone" checkbox on the refund form |
| Record payment on a later period = one payment per period from the next-due one through it (the Paid up to… answer), never a payment aimed at a single later month | 09-26 | Credit is applied in period order, so a payment "for Dec" while Oct is unpaid would fill Oct anyway; recording it per period keeps the history honest | Letting a payment target a period (would need stored allocations and change how credit works) |
| Main-row month chooser and one receipt dialog for Record and Edit (supersedes the v29 inline-only form decision) | 10-04 | Owner needs the month visible before recording and the current coverage visible when editing; keeping the dialog outside the table protects unsaved inputs during background refresh | Another charge-edit shortcut that appears to record cash; rebuilding the form inside a polled row |
| Joining date controls the first prorated bill; Received on controls the receipt's cash date only | 10-04 | Owner confirmed later cycles must stay full price even when cash arrives on another day | Re-prorating each receipt from its cash date |
| Monthly-charge reductions are shown separately from Total paid, which remains receipts minus refunds | 10-04 | A discount lowers what is owed; advance credit is already-received cash. Neither is a second cash receipt. Automatic joining proration is the first bill's baseline | Increasing Total paid when changing a charge; counting proration or refunds as discounts |
| Each package start is independent of the person's join date (v33 supersedes the initial join-date-only control) | 10-04 | One person can subscribe to several packages on different days; cash arrival dates must not re-prorate a bill | Copying a changed joining date to every plan; shifting/deleting historical price entries |
| Annual product price stays annual; payment intervals are 1, 3, 6 or 12 months | 10-04 | Owner confirmed G is annual and requested installment choices in either direction; full-year rounding must reconcile | Reinterpreting Rs 50,000/year as a monthly price; changing legacy schedules during deployment |
| A paid plan's schedule change defaults to its next bill; initial recalculation is explicit and previewed | 10-04 | Preserve earlier bills and cash; let the owner correct an initial setup deliberately | Silently recalculating all past bills when a subscriber changes payment frequency |

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
- **VM timer verification.** On 2026-10-04, the app, Caddy and update/backup/notify timers were all active;
  the VM timezone was `Etc/UTC`. This confirms scheduling, not successful SMTP delivery or backup integrity.
- **Settings product editor on phones.** At 390px in both themes, the product headings caused a 595px-wide
  document. Product creation and reload persistence passed; the overflow remains open. See the final guide's
  section 14 and local `data/catalog-qa/results.json` for the distinction from the v33 release checks.
- **v16** has no CHANGELOG entry (the v15 work landed as four commits); nothing is missing from the code.
- **Oracle "Out of capacity"** was not hit on this tenancy; the fallback in the runbook is standard advice.
- **Certificate for `pay-up.duckdns.org`** was issued when the installer was re-run with `LINK_DOMAIN` on
  2026-09-23; if it ever fails, `journalctl -u caddy` says why (usually DNS not yet pointing at the VM).
- The claude.ai artifact still exists and still works browser-locally; it is not the data store and is not
  updated automatically by the VM pipeline (republishing is a manual step for Claude, see `CLAUDE.md`). Another AI
  tool cannot republish it; it then simply lags behind the repo, which is harmless.

**Known follow-ups (not built yet)**

- Payment recording still clears older bills first. v32 names the earlier periods in the month chooser; paying a single later
  month while leaving an earlier one overdue would require a change to the allocation model.
- The "for 24 Oct – 23 Nov 2026" note the one-tap flow writes is the period's dates at the time of recording; if the cycle day or
  the plan's start is changed afterwards, the note keeps the old dates (payments themselves are re-applied correctly).
- A prorated first period is still named after its cycle's month: a plan started 10 Sep shows "Overdue for Aug" and Paid up to…
  asks "Record 1 payment totalling Rs 1,960 for Aug?" (the dates are on the box, in the tooltip and in the line under the question).
  `periodMonth` is the one place to change if the owner wants "Sep" there.
  v32 receipt choices and period cards also say First bill and show the joining-period dates, but the status policy is unchanged.
- The user row's "Paid through" for a resumed user reads "nothing yet" until the new plan is paid, although the plan that ended at
  the cancellation was paid (only running plans count toward the user's paid-through).
- Refunds (v28): a refund is counted for the plan's package on the refund date, not for the package a single month was billed as.
  A refund on a one-time item larger than what was paid leaves the difference owed (v30 lowers the total by the refund and compares
  what was kept with it). For a cancelled user, "kept after refund" period amounts replace a hand-set amount on the same period, and
  they stay if the user is later resumed (they are recomputed, and removed, only when a refund on that plan is saved or removed while
  the user is cancelled). "Also cancel" in the refund form uses the normal cancellation, so it ends all of that user's plans.

**v32 local verification.** `tests/payment-flow.cjs` uses synthetic records in a disposable Flask store and rejects production
URLs. It covers actual receipts, charge discounts, cash dates, first bills, edits, refunds, partial and advance payments, multiple
accounts, ended plans, save failure/retry, polling and 390px/1400px light/dark layouts. No owner data or production login was used.
Its check record and screenshots are local ignored files under `data/payment-qa/`; repeat the check before any subsequent push.

**v33 local verification.** Both `tests/payment-flow.cjs` and `tests/package-start-flow.cjs` run on a disposable local Flask store.
The package check pins the browser date and needs `WASOOL_TODAY=2026-10-20` on the local server for the subscriber-page check.
It covers independent starts, preserved price/cash records, annual first proration, all four schedules, exact full-year PKR/USD
totals, schedule changes in both directions, a delayed settings response, quarterly discount/refund reconciliation, subscriber
period dates and skipped intervening months, polling, save failure/retry and both themes at 390px/1400px. Outputs and screenshots
are ignored under `data/start-qa/`. Live SMTP sending and handset-specific browser behaviour remain separately unverified.

**Start/schedule follow-ups.** Custom charges and dated schedule changes remain attached to their original dates when a start
is moved. The preview names these; the owner can adjust a period with change charge / package. An existing first-period waiver
and remaining-due-by date are preserved and still editable in the full plan form. Historical receipt notes keep their original
period wording. The older Quick add parser has no installment selector; use Add user or Package start / payments for an annual
installment setup. An annual schedule chosen for payment collection describes billing amounts; it does not record cash or create
a subscriber self-service schedule-choice form.

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
