# Wasooli final handoff and recovery guide

Prepared for Aly Jafferani on 5 October 2026, Asia/Karachi. Application version: **v35**. Verified source commit: **b88bc47 — Clarify bill settlement and refund choices (v35)**.

This document explains how Wasooli was made, how to use and maintain it, how to host it on another server, and how to give the work to another LLM. It is a snapshot of the working application, not a backup of the owner's records or credentials. Keep this guide with the repository and keep the recovery files listed in section 6 privately, outside the repository.

The live site returned `ok: true` and `version: "35"` after the v35 release. The v35 local verification passed 68 browser checks, including 21 new billing/refund checks, with 390px and 1400px light/dark layouts and no unexpected console/page errors. The live update and the separately authorized Mohib correction were verified by read-only checks after deployment. A private before-copy is stored on the VM; no other owner records were changed.

**Owner-record correction completed 5 October 2026.** Mohib's September 1–23 first bill remains Rs 4,200 and his September 24–October 23 bill is explicitly set to Rs 3,360. His existing October 4 receipt keeps its ID and date and its amount is Rs 3,360. Cash kept is Rs 7,560, and the next October 24 bill is the normal Rs 4,200. Haroon's records were not changed. If Haroon keeps paying Rs 4,200 against a Rs 3,500 agreed bill, the Rs 700 difference remains genuine advance credit. When he eventually leaves, use **Return money → Return cash; leave bills unchanged** for the amount actually given back, then use the cancellation flow for his last access day. That records the credit payout and cancellation separately while preserving the historical receipts.

**Update, 5 October 2026 — v34 cancellation:** Cancel subscription now asks **No bills from billing month** and shows the inclusive last access day and balance before saving. Choosing September stops the bill starting September 24 and sets the last day to September 23. For someone already cancelled, use **Edit cancellation** to correct the cutoff, then save. Receipts, refunds and independently ended plans are kept; existing refund settlements are recalculated, while genuinely unpaid earlier bills remain due. No existing owner record is corrected automatically. The installation snapshot below remains the dated v33 snapshot from 4 October; check the live badge or health endpoint for the current release.

## Contents

1. [What Wasooli does](#1-what-wasooli-does)
2. [How we made it](#2-how-we-made-it)
3. [Current installation and verification](#3-current-installation-and-verification)
4. [Architecture and files](#4-architecture-and-files)
5. [Billing and everyday use](#5-billing-and-everyday-use)
6. [What to keep for recovery](#6-what-to-keep-for-recovery)
7. [Host a fresh installation](#7-host-a-fresh-installation)
8. [Back up and move an existing tracker](#8-back-up-and-move-an-existing-tracker)
9. [Restore the records](#9-restore-the-records)
10. [Run locally and verify a change](#10-run-locally-and-verify-a-change)
11. [Make and release changes](#11-make-and-release-changes)
12. [Operations and troubleshooting](#12-operations-and-troubleshooting)
13. [Rules for another LLM](#13-rules-for-another-llm)
14. [Known issues and verification limits](#14-known-issues-and-verification-limits)
15. [Copyable continuation prompt](#15-copyable-continuation-prompt)
16. [Source references and final checklist](#16-source-references-and-final-checklist)

## 1. What Wasooli does

Wasooli, “Know who's paid.”, is a one-owner tracker for people sharing paid SaaS accounts. Aly records subscribers, their accounts and packages, prices, receipts, refunds and costs. The app computes billing periods, advance credit, balances, paid-through dates and overdue status. It supplies WhatsApp, Telegram and email reminder flows, and private subscriber choice pages at `/c/<token>`.

It tracks money already received; it does not charge a bank card, collect money through a payment processor, or automatically send WhatsApp messages. The owner opens and sends the prepared messages. The separate SMTP notification service can send reminder emails once configured.

The production server is the one authoritative database. Opening the HTML as a local file uses a different browser-local store. The Claude artifact is a separate demo/runtime and does not synchronize with the production database.

## 2. How we made it

### The original design

The historical handoff records that the application began in Claude in a Slack thread on 21–23 September 2026. It started as one HTML file with subscribers and payment calculations, then gained billing cycles, multiple accounts per person, currencies, costs, reminders and imports. The single-file design made it possible to run the same admin interface in an artifact, from a local file, or on a server.

The owner needed the phone to work when the desktop was off. The project therefore gained a Flask backend and SQLite document store, an Oracle Ubuntu VM, DuckDNS hostnames and Caddy for HTTPS. The installer and systemd timers make normal deployment a GitHub push rather than a manual server editing job.

The history below is summarized from `CHANGELOG.md`, `docs/HANDOFF.md` and the current Git history. The earlier development account is historical documentation; this session independently verified the current source and installation.

| Stage | What was added and why |
| --- | --- |
| v1–v14, 21–22 September | Subscriber records; monthly/yearly/one-time items; shared 24th billing cycle; initial proration; USD/PKR; costs; multiple packages/accounts; reminders; discounts and credit. |
| v15–v18, 22 September | Flask and SQLite; passcode login; subscriber links; JSON export/import; Oracle installer; guarded seeding and schema handling. Schema remains 11. v16 has no separate changelog heading because that work landed across several commits. |
| v19–v23, 22 September | Tier and price history; editable period charges; subscriber answers; three-stage message queue; SMTP timer; screenshot-reading provider settings. |
| v24–v26, 23 September | Wasooli name and brand; hidden sign-in address; per-IP lockout; long-lived sessions; separate subscriber-domain support; analytics; working guides for coding tools. |
| v27–v31, 25–26 September | Resume/cancellation history; refunds; payment questions; immediate redraw after saves; more precise due dates/status; accounts and packages visible per person. |
| v32, 4 October, commit `3b12a26` | Dashboard **Record month payment**; billing period separated from actual cash date; receipt-edit coverage preview; first-bill preview; actual receipts and discounts shown separately; drafts survive polling and failed saves. |
| v33, 4 October, commit `2ef5838` | Dashboard **Package start / payments**; independent package starts; first/next-bill previews; annual prices collected monthly, every 3/6 months or yearly; future schedule changes; exact full-year rounding; saved-settings readiness before quoting bills. |

### Why this structure was retained

The admin interface remains one file, vanilla JavaScript with inline CSS and SVG. There is no React, build pipeline or JavaScript library dependency. The backend is small and uses SQLite rather than introducing a separate database server. One shared calculation engine feeds the dashboard, payment previews, Summary and Analytics, so a new feature should reuse those calculations.

The governing decisions are that cash receipts remain factual records, charges are computed separately, only the first partial period is prorated, and deployment must preserve existing owner data. A new field normally uses an absent-value default rather than a migration.

## 3. Current installation and verification

| Item | Snapshot on 4 October 2026 |
| --- | --- |
| Repository | `https://github.com/ssdbank9/SaaS-Payment-Tracker` |
| Release branch | `main`; a push is a production release. |
| Application version | v33; badge, `server/app.py` VERSION and newest changelog entry agree. |
| Source and VM commit | `2ef5838` |
| Admin hostname | `wasooli.duckdns.org` |
| Public health check | `https://wasooli.duckdns.org/healthz` |
| Admin sign-in | `https://<DOMAIN>/x/<effective ADMIN_PATH>`; use the owner's private bookmark. Do not include the actual path in public documents. |
| VM address | `141.145.157.7`; recheck before a future operation. |
| Original VM configuration | Oracle `VM.Standard.A1.Flex`, 1 OCPU / 6 GB, Ubuntu 24.04 arm64, according to the original deployment record. |
| VM timezone | `Etc/UTC`, independently checked for this handoff. Application timezone defaults to `Asia/Karachi`. |
| Code directory | `/opt/payments-tracker` |
| Owner data directory | `/var/lib/payments-tracker` |
| Database | `/var/lib/payments-tracker/tracker.sqlite3` |
| Uploaded files | `/var/lib/payments-tracker/assets/` |
| Private environment file | `/etc/payments-tracker.env` |
| HTTPS configuration | `/etc/caddy/Caddyfile` |
| Application service | `payments-tracker.service`, Gunicorn on `127.0.0.1:8080`; Caddy serves public HTTPS. |
| Update timer | Every 5 minutes, with up to 30 seconds randomized delay. |
| Backup timer | 03:15 in the VM's system timezone: currently 03:15 UTC / 08:15 Karachi. Newest 30 database backups retained. |
| Notification timer | 04:00 UTC / 09:00 Karachi, with up to 5 minutes randomized delay; sends only when configured and the queue has eligible work. |

**Subscriber-domain qualification:** the old deployment record names `pay-up.duckdns.org`, but the current health response has `linkBase: ""`. The separate subscriber hostname is therefore not confirmed as configured in the current service. Do not silently add or change it. Inspect the existing configuration privately and obtain Aly's approval before changing domains. A blank `linkBase` also does not prove the old DNS name or certificate was deleted.

**Snapshot qualification:** the live check proves the deployed version and health endpoint. It is not a complete audit of the owner database, backups, SMTP delivery, DNS tenancy or every handset. Recheck the version and relevant state when resuming this project.

## 4. Architecture and files

```text
Phone or desktop browser
        |
        | HTTPS, ports 80/443 for Caddy and certificate handling
        v
Caddy reverse proxy
        |
        | 127.0.0.1:8080 only
        v
Gunicorn -> Flask server/app.py
        |                    |
        | serves index.html  | login, docs API, uploads,
        |                    | subscriber pages and settings
        v                    v
Single-file admin UI      SQLite + uploaded receipt files
                          /var/lib/payments-tracker

GitHub main -> update timer -> deploy/update.sh -> restart application
Backup timer -> deploy/backup.sh -> SQLite snapshot + assets archive
Notify timer -> server/notify.py -> eligible SMTP reminders
```

| File or directory | Purpose |
| --- | --- |
| `AGENTS.md` | Canonical coding rules. Read first and follow them. |
| `docs/HANDOFF.md` | Project state, decisions, model, operations and follow-ups. |
| `CHANGELOG.md` | Version history, newest first. |
| `README.md` | Owner-facing usage and hosting overview. |
| `index.html` | Entire admin interface, storage adapters, money calculations, forms, charts and styles. Keep it one file. |
| `server/app.py` | Flask routes, VERSION, document API, public subscriber pages, exports/imports and security/provider endpoints. |
| `server/auth.py` | Passcode, signed sessions, known-device cookie, hidden sign-in path and rate limits. |
| `server/db.py` | SQLite document storage, metadata, subscriber answers, audit and login-attempt tables. |
| `server/notify.py` | Scheduled email reminder job; supports `--dry-run`. |
| `server/claude_read.py`, `server/gemini_read.py` | Optional screenshot-reading providers. |
| `server/templates/confirm.html` | Subscriber choice page. |
| `server/requirements.txt` | Pinned Python dependencies. |
| `deploy/setup.sh` | Ubuntu installer, preserving omitted existing environment values. |
| `deploy/update.sh` | Fetches main, resets only the disposable VM code checkout, refreshes units and restarts when needed. |
| `deploy/backup.sh` | SQLite online backup, gzip, rolling assets archive and retention. |
| `deploy/systemd/` | App service and update/backup/notify service/timer definitions. |
| `assets/` | Brand SVGs, icons and manifest. This is different from uploaded data-directory `assets/`. |
| `tests/payment-flow.cjs` | Local synthetic receipt/charge regression checks. |
| `tests/package-start-flow.cjs` | Local synthetic start/installment/schedule regression checks. |
| `docs/setup-runbook.html` | Older printable setup guide. Some cloud allowance statements are dated; use current official limits. |

### Storage and calculation details for the next developer

The admin detects the Flask runtime, Claude artifact runtime or `localStorage`. The server stores JSON documents keyed by paths such as `settings/main`, `users/<id>`, `costs/<id>` and `confirm/<token>`. SQL tables also hold subscriber answers, audits, login attempts and private metadata.

A person has `joinDate` and `subscriptions[]`. Every recurring subscription has its own `start`, prices/history, package, currency, proration settings, receipts and refunds. The person's join date, package start and receipt date are three different facts.

Recurring plans have `kind: "monthly"`; their `cycle` distinguishes monthly from yearly pricing. Do not rename that stored kind merely because an annual plan is now paid in installments. For an annual-priced plan, optional `paymentEvery` is 1, 3, 6 or 12 months, and optional dated `paymentSchedule[{from,months}]` changes the interval. Absent values preserve the old yearly behavior. `prices[].price` remains an annual amount for yearly products.

Billing periods are computed, not stored. Use `pStart`, `payMonthsAt`, `installmentPrice`, `periodAmt`, `periodFull`, `analyzeMonthly`, `coverPlan` and `analyze`. Use the existing reporting helpers for Summary and Analytics. `persistUser` saves and redraws immediately. `paymentDialog` and `startDialog` sit outside the table so background refresh cannot discard their drafts. `settingsLoaded` blocks provisional billing calculations during startup.

`nextSt` is a period key; `nextDue` is its actual due date, including a mid-cycle package start. Do not use those interchangeably. Custom `periodOverrides` retain their original date keys. Price history, receipts and refunds must be preserved when starts or schedules change.

Private SQL metadata includes AI/mail credentials, the effective regenerated sign-in path and session-secret version. The hidden path in that table takes precedence over `ADMIN_PATH` in the environment file.

## 5. Billing and everyday use

### Create a package or product

Open **Settings → Packages & products → Add package or product**, enter its name, billing type, optional default price/currency and description, then **Save settings**. The billing types are monthly, yearly and one-time. Each product currently has one default price and currency; it does not have two independent USD and PKR list-price fields. The other currency equivalent uses the configured exchange rate.

Default prices prefill new subscriptions; the owner can set a person's own price. Existing subscription prices are not automatically rewritten when a package default changes. New products were verified to save, survive reload and appear in Add user. The Settings product editor has a confirmed phone layout issue described in section 14.

### Add a person and their package

Use **Add user**. Enter **Joined on** for the person, then **Package started on** for that package. Read the first-bill and next-bill preview. Saving creates the subscriber and opens a receipt form; it does not invent a payment.

For another account or product held by the same person, expand the row and use **Add plan or one-time item**. That package gets its own start date. Use **Package start / payments** beside the name, or **Change start / payments** inside a plan, to correct a start later.

### Monthly first-period proration

Ordinary monthly periods run from the 24th to the following 23rd. On the default fixed-30-day basis, a Rs 4,200 monthly package started on 10 October has 14 chargeable days through 23 October:

```text
Daily rate:        Rs 4,200 / 30 = Rs 140
First partial bill: 14 x Rs 140  = Rs 1,960
Next bill:         Rs 4,200 for 24 October–23 November
```

Only the first partial period is prorated. Receiving the next payment late or on a different date does not prorate the next bill. The owner can select actual-day proration or explicit first-period adjustments where the existing forms provide those choices.

### Annual price with installment payments

G remains an annual-priced product. At Rs 50,000 per year, full 3-month bills are Rs 12,500 and full 6-month bills are Rs 25,000. Monthly installments balance rounding so twelve full installments total exactly Rs 50,000. A full year of USD installments likewise reconciles to the annual USD price.

New annual plans and explicit initial start/proration edits use actual days for their first partial installment. Existing annual records keep their previous choices until the owner edits them. A prorated first installment is followed by full installments starting on the shared 24th at the selected interval. Quarterly/half-yearly boundaries follow the shared anchor; they are not a new anniversary based on the cash date.

For an existing plan with receipts, changing the payment frequency defaults to **Next bill**, preserving earlier bills. **Package start** explicitly recalculates from the beginning; inspect the balance and paid-through preview before saving. Existing dated schedule entries and custom charges retain their date keys. No cash record is created by a schedule edit.

### Record or edit money received

Use **Record month payment** beside the person's name. Choose the account and **Pay through billing month**, review the exact dates and amount left, and enter the actual cash and **Received on** date. Currency, receipt rate and note are available in the expanded options.

Cash clears older unpaid periods first. Choosing a later month includes earlier unpaid bills and names them; the app does not store allocations that skip an older debt. Extra cash carries forward as advance credit.

Use **Edit** in receipt history to correct an actual receipt. The preview shows current/resulting coverage, cash total and paid-through date. Saving preserves its identity and updates the main screen immediately. A failed save keeps the draft for retry.

### Understand totals, discounts and refunds

- **Total paid** is receipts minus refunds: money retained, not the total of listed charges.
- A discount changes a bill; use **change charge / package**. It does not add a receipt.
- Initial proration is the initial charge calculation, not a cash payment or ordinary discount.
- A refund is its own dated record and lowers retained receipts and revenue. On a recurring plan it can make a previously covered bill owed again. A one-time refund reduces the sale total as well as retained cash.
- Reporting Net is collected minus refunds minus costs for the selected range.

Example: Rs 8,400 received covers a Rs 3,220 first bill and a Rs 4,200 next bill, leaving Rs 980 advance credit. The following full Rs 4,200 bill needs Rs 3,220 of new cash. Recording that cash raises Total paid to Rs 11,620. Reducing a charge alone would not raise Total paid.

## 6. What to keep for recovery

**A GitHub clone and this guide recover the software, not the owner's records.** To rebuild the same tracker, retain the following privately:

| Recovery item | What it recovers |
| --- | --- |
| Latest valid `tracker-*.sqlite3.gz` | Full SQLite records, including private metadata, subscriber answer history and audit tables. |
| `assets-latest.tar.gz` | Uploaded receipt files; the normal backup keeps one rolling assets archive. |
| `/etc/payments-tracker.env` | Runtime settings, passcode, SECRET_KEY, environment sign-in path, domains and optional environment keys. |
| `/etc/caddy/Caddyfile` | Existing HTTPS/proxy host configuration; the installer can regenerate it. |
| UI **Export everything (JSON)** | Portable subscribers, plans, cash records, refunds, costs, application settings and schema/seed markers. |
| SSH private key and account recovery access | Access to the VM, Oracle account, DNS account and GitHub. Store keys in a protected location. |
| Private sign-in bookmark and chosen domain records | How the owner reaches the admin; the effective path can also be recovered from full SQL metadata. |

The UI JSON export is not a full server backup. It excludes private SQL metadata/AI and SMTP secrets, SQL subscriber-answer/audit/login-attempt tables and binary uploaded files. It includes the subscriber tokens held on user records, but derived public cards should be refreshed by opening the admin/Queue after recovery. The separate `/api/export` route exports stored documents; that still does not export every SQL table or uploaded file.

The full SQLite backup and environment file contain sensitive information. Do not put them in the repository or attach them to a public LLM conversation. Keep at least one verified off-server copy; backups on the same VM do not protect against losing that VM. Record when each recovery set was taken, which app version it came from, and whether it has been restored successfully.

## 7. Host a fresh installation

This section is for a **new Ubuntu VM**. Hosting elsewhere is possible with the same app, but the supplied installer and units assume Ubuntu/Debian, systemd and the standard paths. A static host alone cannot replace the Flask database or subscriber routes.

### Step 1 — Confirm accounts, capacity and the intended hostnames

Have GitHub access to the source, an Oracle account or another Ubuntu VPS, an SSH key, and DNS control. For Oracle, choose a supported Ubuntu image, a public subnet/public IPv4 and an internet route. The recorded setup uses Ubuntu 24.04 arm64 on A1 with 1 OCPU / 6 GB.

Check the cloud console's actual eligibility, existing allocations and cost estimate before creating resources. The older runbook says A1 had 4 OCPUs / 24 GB free; Oracle's official page retrieved on 4 October 2026 instead describes 1,500 OCPU-hours and 9,000 GB-hours, equivalent to 2 OCPUs / 12 GB for Always Free tenancies. This does not establish Aly's remaining allowance or grandfathered account entitlement. Capacity can be unavailable and idle free instances may be reclaimed. Verify the terms again at the time of rehosting. [Oracle Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

Follow the current [Oracle instance creation guide](https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/launchinginstance.htm). Save the generated private key securely. Do not terminate an existing VM or boot volume to make room without owner approval and a verified off-server recovery set.

### Step 2 — Network and DNS

In the subnet's Security List or NSG, permit inbound TCP 80 and 443 for the website. Preserve SSH access on TCP 22, preferably restricted to the administrator's source IP where practical. Cloud rules and the VM's own firewall are separate; the installer handles the latter. [Oracle Security Lists](https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/securitylists.htm).

Create or update the approved admin A record to the new public IP. An optional separate subscriber hostname also points to that IP. For DuckDNS, use the account that owns the names; keep its token private. [DuckDNS update specification](https://www.duckdns.org/spec.jsp).

For an existing tracker, changing DNS is a cutover, not an ordinary code change. Freeze writes on the old site, take a final backup and restore the new site before letting the owner resume work. Obtain approval for the IP/domain change; do not let the owner edit two independent copies.

**Done when:** the new VM is running, SSH is reachable and the intended A records resolve to its address. For a migration, the final production cutover remains deliberate and approved.

### Step 3 — Connect from Windows

Run in PowerShell, replacing both placeholders:

```powershell
ssh -i 'C:\path\to\your-private-key.key' ubuntu@NEW_VM_PUBLIC_IP
```

Verify the first-connect host fingerprint against the intended VM before accepting it. If a rebuilt VM has the same IP but a different host key, verify that rebuild first; do not disable SSH host checking globally. The original key location was the owner's Downloads folder, but it is not part of the repo and must not be assumed to exist on another computer.

**Done when:** the prompt belongs to the intended Ubuntu VM.

### Step 4 — Inspect and run the installer

The commands below run **inside the Ubuntu SSH session**, not PowerShell. Use the owner's approved hostnames instead of the illustrative names if different.

```bash
curl -fsSL https://raw.githubusercontent.com/ssdbank9/SaaS-Payment-Tracker/main/deploy/setup.sh -o /tmp/wasooli-setup.sh
less /tmp/wasooli-setup.sh
sudo env DOMAIN=wasooli.duckdns.org LINK_DOMAIN=pay-up.duckdns.org APP_TZ=Asia/Karachi bash /tmp/wasooli-setup.sh
```

Using a downloaded script rather than piping it leaves a terminal available for its masked passcode prompt on a fresh install. Choose and privately retain a strong passcode; the installer requires at least eight characters and its prompt recommends twelve or more. If a separate subscriber domain is not approved, omit `LINK_DOMAIN=...` from the command. Do not add it to the current live host merely because it appears in this example.

The installer installs Python/venv, Git and Caddy; fetches main into `/opt/payments-tracker`; installs pinned requirements; creates the service user and standard data directories; writes a protected environment file; installs/enables the app and timers; configures Caddy; opens VM ports 80/443; and prints health and private sign-in information. It generates SECRET_KEY and ADMIN_PATH when missing. Re-running it preserves existing omitted environment values but updates code and rewrites proxy configuration: inspect the context before using it on an existing server.

Caddy obtains and renews certificates when DNS, reachability and hostname configuration meet its requirements. [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https).

**Done when:** the installer completes, the app answers locally, and the private sign-in address has been stored securely.

### Step 5 — Verify and initialize

```bash
sudo systemctl status payments-tracker.service caddy --no-pager
systemctl list-timers 'payments-tracker*' --no-pager
curl --fail --silent --show-error http://127.0.0.1:8080/healthz
curl --fail --silent --show-error https://wasooli.duckdns.org/healthz
```

Compare the deployed version with the current source; it may be later than v33 on a future install. The public root being neutral is intentional. Sign in using the printed hidden address, not an assumed `/login` URL. An empty store can seed demonstration records; they are not recovered owner data. If restoring a tracker, proceed to section 9 before normal use. Do not manually reset or delete records as a shortcut.

For a genuinely new tracker, review packages/prices, currency rate, billing day and annual anchor, proration basis, contact methods and payment instructions. Configure AI and mail only if wanted. A working timer does not establish working SMTP delivery. Test delivery only with the owner's intended recipient and authorization. Add the private admin page to the phone home screen.

**Done when:** the correct records and settings are present, a phone can sign in over HTTPS, and the version badge matches the server.

## 8. Back up and move an existing tracker

These are procedures for a future authorized recovery or migration. They were not executed on production while preparing this guide. An LLM must obtain approval before freezing service, changing domains or replacing a database.

### A. Portable UI export

Use **Settings → Your data → Export everything (JSON)**. Store the file privately outside the repo and check that it is valid JSON with the expected user/cost counts and recent receipts. It is useful alongside the full server recovery set; its exclusions are listed in section 6.

### B. Full server recovery set

The scheduled script uses SQLite's online backup API, so it can snapshot a running database safely. Do not copy only the live `tracker.sqlite3` file while ignoring its WAL state.

On the **old Ubuntu VM**, run the following only after approving the backup and confirming standard paths:

```bash
sudo /opt/payments-tracker/deploy/backup.sh
sudo ls -lt /var/lib/payments-tracker/backups/
```

Select the new `tracker-YYYYMMDD-HHMMSS.sqlite3.gz`. The directory also contains `assets-latest.tar.gz`. To assemble a private transferable recovery directory, use the selected filename below:

```bash
wasooli_stamp=$(date +%Y%m%d-%H%M%S)
wasooli_recovery="/home/ubuntu/wasooli-recovery-$wasooli_stamp"
sudo install -d -m 700 -o ubuntu -g ubuntu "$wasooli_recovery"
sudo cp /var/lib/payments-tracker/backups/tracker-CHOOSE-TIMESTAMP.sqlite3.gz "$wasooli_recovery/"
sudo cp /var/lib/payments-tracker/backups/assets-latest.tar.gz "$wasooli_recovery/"
sudo cp /etc/payments-tracker.env "$wasooli_recovery/"
sudo cp /etc/caddy/Caddyfile "$wasooli_recovery/"
sudo chown -R ubuntu:ubuntu "$wasooli_recovery"
sudo chmod -R go-rwx "$wasooli_recovery"
cd "$wasooli_recovery"
sha256sum tracker-*.sqlite3.gz assets-latest.tar.gz payments-tracker.env Caddyfile > SHA256SUMS
gzip -t tracker-*.sqlite3.gz
tar -tzf assets-latest.tar.gz
```

Use an actual chosen filename in place of `tracker-CHOOSE-TIMESTAMP...`; do not run that placeholder literally. The assets archive should contain the `assets/` directory and expected files. For a final migration snapshot, stop owner edits and prevent notification writes while taking the final set; an online backup alone does not prevent later receipts being added to the old site.

From **Windows PowerShell**, copy the private recovery directory to a protected location outside the code checkout:

```powershell
New-Item -ItemType Directory -Path 'D:\PrivateBackups\Wasooli' -Force
scp -i 'C:\path\to\your-private-key.key' -r 'ubuntu@OLD_VM_IP:/home/ubuntu/wasooli-recovery-CHOOSE-TIMESTAMP' 'D:\PrivateBackups\Wasooli'
```

Keep the recorded hashes and verify them after transfer. This archive contains secrets and business data; restrict access and use protected/encrypted storage. Keeping the environment file on the same VM is not an off-server backup. Do not remove the old host or its boot volume until the new installation has been verified and the owner accepts the cutover.

## 9. Restore the records

### Route A — Restore a UI JSON export

Use this when only the portable export exists, or when the owner explicitly chooses it. On the new installation, sign in and use **Settings → Your data → Import everything (JSON)** with the approved file.

**Import is destructive to the destination's users and costs:** records absent from the file are removed, existing matching documents are replaced, and settings are replaced. The app asks for confirmation. An LLM must also obtain the owner's explicit approval and preserve the current destination data first. A routine code change must never perform an import.

After importing, verify subscriber/plan/cost counts, recent receipts, refunds, totals, dates and annual schedules against the source export. Reconfigure private AI/mail settings and recover uploaded files separately. Open the admin/Queue to refresh derived subscriber cards; verify their amounts and links before sending anything. A JSON import does not recover the full SQL answer/audit history.

### Route B — Restore the full SQLite backup and assets

This recovers the private database tables too. Upload the recovery directory to `/home/ubuntu/` on the new VM using `scp -r`. Check its hashes with `sha256sum -c SHA256SUMS`, then validate `gzip -t` and inspect `tar -tzf`. Inspect archive member paths before extracting; do not accept unexpected absolute or parent-traversal paths.

The following sequence assumes the standard service/data paths and an explicitly approved restore. Run it on the **destination Ubuntu VM**. Do not run it on the live owner database as part of a code release.

**1. Pause timers and wait for any running one-shot jobs.**

```bash
sudo systemctl stop payments-tracker-update.timer payments-tracker-backup.timer payments-tracker-notify.timer
systemctl is-active payments-tracker-update.service payments-tracker-backup.service payments-tracker-notify.service
```

`inactive` for these one-shot services is expected when they are not running. If a job is active, wait for it to finish and inspect its status; do not swap the database underneath a running notifier, backup or updater. Then stop the application:

```bash
sudo systemctl stop payments-tracker.service
```

**2. Prepare a new restore directory without overwriting the old one.** Replace the recovery path and database filename with the actual uploaded values.

Run each step separately and stop on any failure. Enable pipeline failure reporting in the destination's Bash shell so decompression errors cannot be hidden by `tee`.

```bash
set -o pipefail
wasooli_stamp=$(date +%Y%m%d-%H%M%S)
wasooli_restore="/var/lib/payments-tracker.restore-$wasooli_stamp"
wasooli_recovery="/home/ubuntu/wasooli-recovery-CHOOSE-TIMESTAMP"
wasooli_backup="$wasooli_recovery/tracker-CHOOSE-TIMESTAMP.sqlite3.gz"
sudo install -d -m 750 -o payments-tracker -g payments-tracker "$wasooli_restore"
sudo gzip -dc "$wasooli_backup" | sudo tee "$wasooli_restore/tracker.sqlite3" >/dev/null
sudo tar -xzf "$wasooli_recovery/assets-latest.tar.gz" -C "$wasooli_restore"
sudo install -d -m 750 -o payments-tracker -g payments-tracker "$wasooli_restore/backups"
sudo cp "$wasooli_backup" "$wasooli_restore/backups/"
sudo chown -R payments-tracker:payments-tracker "$wasooli_restore"
sudo chmod 750 "$wasooli_restore"
sudo chmod 600 "$wasooli_restore/tracker.sqlite3"
```

**3. Validate the restored database before replacing the destination.**

```bash
sudo /opt/payments-tracker/venv/bin/python - "$wasooli_restore/tracker.sqlite3" <<'PY'
import sqlite3, sys
con = sqlite3.connect('file:' + sys.argv[1] + '?mode=ro', uri=True)
try:
    rows = [r[0] for r in con.execute('PRAGMA integrity_check')]
    assert rows == ['ok'], rows
    for table in ('docs', 'meta', 'confirmations', 'audit', 'login_attempts'):
        print(table, con.execute('SELECT COUNT(*) FROM ' + table).fetchone()[0])
    print('Restored SQLite integrity: ok')
finally:
    con.close()
PY
```

The table counts are private recovery evidence, not material to publish or paste into a public conversation. If validation fails or the backup is clearly from the wrong date, stop and keep the original destination intact.

**4. Preserve and swap the entire destination directory.** This keeps any old database, WAL/SHM files, assets and backups together; an old WAL cannot accidentally be applied to the restored main database.

```bash
sudo mv /var/lib/payments-tracker "/var/lib/payments-tracker.before-restore-$wasooli_stamp"
sudo mv "$wasooli_restore" /var/lib/payments-tracker
```

These commands replace the destination's data location. Obtain approval before running them, verify the exact resolved paths, and never delete the preserved directory as an automatic cleanup step.

**5. Restore or reconcile private runtime configuration.** Preserve the destination environment file first. If the recovery file is confirmed appropriate for the approved hostnames, standard data directory and service, restore it:

```bash
sudo cp -a /etc/payments-tracker.env "/etc/payments-tracker.env.before-restore-$wasooli_stamp"
sudo install -m 640 -o root -g payments-tracker "$wasooli_recovery/payments-tracker.env" /etc/payments-tracker.env
```

Do not blindly overwrite it if the new domains or paths differ. Have the owner approve the specific reconciliation, preserve all unrelated keys, and keep the old SECRET_KEY/passcode when recovering the same installation unless a deliberate rotation is approved. Never print its complete contents into an LLM tool log. Reconcile Caddy hosts with approved DOMAIN/LINK_DOMAIN/OLD_DOMAIN values; only restore its old Caddyfile if those hostnames still apply. The installer can regenerate Caddy, but it also starts timers, so do not use it casually in the middle of this paused restore.

**6. Start the app, verify owner data, then resume timers deliberately.**

```bash
sudo systemctl start payments-tracker.service
curl --fail --silent --show-error http://127.0.0.1:8080/healthz
sudo systemctl status payments-tracker.service caddy --no-pager
```

Check the approved public domain over HTTPS and sign in at the effective hidden address. Restored SQL `meta.admin_path`, if present, overrides the environment path. Compare expected users, subscription dates, receipts/refunds, costs, totals and annual installment choices with the recovery baseline. Open the admin/Queue to refresh derived cards and inspect subscriber links without submitting answers or sending messages.

When accepted, resume update and backup timers:

```bash
sudo systemctl start payments-tracker-update.timer payments-tracker-backup.timer
systemctl list-timers 'payments-tracker*' --no-pager
```

Resume `payments-tracker-notify.timer` only after confirming SMTP, queue contents and the owner's readiness for automatic email. Its persistent schedule can run overdue work when started. Keep the pre-restore directory and old host until the owner accepts the new installation. A rollback must stop writers again and restore the preserved directory/configuration; do not improvise a reset or delete during a failed recovery.

**Recovery acceptance:** a passing health check is necessary but insufficient. Recovery is complete only when the owner accepts the restored records, uploaded files, access, domains and required reminder behavior. No end-to-end production restore was performed for this handoff.

## 10. Run locally and verify a change

Use a disposable local store. Do not download the production database merely to develop or test a UI change, and never point tests at the hosted site. Empty local stores can seed sample records; that behavior is intentional for local testing, not a way to reset production.

### Ubuntu/Linux

From the repository root:

```bash
python3 -m venv venv
venv/bin/pip install -r server/requirements.txt
DATA_DIR=/tmp/wasooli-qa ADMIN_PASSCODE=test1234 SECRET_KEY=x COOKIE_SECURE=0 \
  ADMIN_PATH= DOMAIN= LINK_DOMAIN= OLD_DOMAIN= WASOOL_TODAY=2026-10-20 \
  venv/bin/python -c "import sys; sys.path.insert(0,'server'); import app; app.app.run(host='127.0.0.1',port=8098)"
```

### Windows PowerShell

Use an installed Python 3.10+; `py -3` is an example launcher, not a guarantee it is installed. A coding agent should detect the actual runtime before running it.

```powershell
py -3 -m venv venv
.\venv\Scripts\python.exe -m pip install -r server/requirements.txt
.\venv\Scripts\python.exe -m pip install tzdata
$env:DATA_DIR = Join-Path (Get-Location).Path 'data\qa-local'
$env:ADMIN_PASSCODE = 'test1234'
$env:SECRET_KEY = 'x'
$env:COOKIE_SECURE = '0'
$env:ADMIN_PATH = ''
$env:DOMAIN = ''
$env:LINK_DOMAIN = ''
$env:OLD_DOMAIN = ''
$env:WASOOL_TODAY = '2026-10-20'
.\venv\Scripts\python.exe -c "import sys; sys.path.insert(0,'server'); import app; app.app.run(host='127.0.0.1',port=8098)"
```

Windows may need `tzdata` for Python's timezone support. This session used the bundled runtime's existing timezone files through PYTHONTZPATH instead; do not assume that machine-specific cache path exists elsewhere. The development server is Flask; production uses Gunicorn on Ubuntu. The illustrative `test1234` and `x` values are local-only credentials, never production settings.

Sign in at `http://127.0.0.1:8098/login`. Pin browser calculations when necessary:

```javascript
localStorage.setItem('pt-today', '2026-10-26');
```

The package/start test requires the disposable server's `WASOOL_TODAY=2026-10-20` and manages its browser dates. It must be able to publish the October subscriber card and then check an intervening month. Do not confuse the actual receipt date, browser pin, server pin and published card cycle.

### Browser checks

Use Node 18+ and Playwright. Install browser dependencies in a scratch directory, not by adding a frontend build/dependency structure to this repo. If the module is outside normal resolution, set `PLAYWRIGHT_MODULE` to its absolute module directory. If using an installed compatible browser, set `PLAYWRIGHT_EXECUTABLE` to its verified executable path; otherwise install Playwright's Chromium in the scratch setup.

In another terminal with the local server running:

```bash
node tests/payment-flow.cjs
node tests/package-start-flow.cjs
```

For PowerShell the same Node commands work after setting any needed environment overrides. These tests write synthetic records to the local server. Results and screenshots go under ignored `data/payment-qa/` and `data/start-qa/`.

Before every push, verify 390px and 1400px in light and dark themes, collect console/page errors, inspect screenshots and check document overflow. Include the changed panel and related flows, not just the landing dashboard. For the current known product-editor issue, Settings must be included explicitly. Font requests need network access for a console-clean browser check. Complete initial seeding before collecting acceptance errors; the two deliberate HTTP 503 tests verify failed-save retry and are separately identified expected failures.

Check the extracted inline script with `node --check`, compile changed Python files, run `git diff --check`, and verify badge/VERSION/changelog agreement. Do not claim source inspection or a JavaScript harness is a substitute for a real browser pass. Stop the local server after testing; if an old process handle expires, verify the actual listener/process rather than assuming it stopped.

## 11. Make and release changes

### What Aly needs to do

Give the LLM this document and access to the repository, then describe the requested outcome in plain words. Say which problem or screen matters and give a concrete example of the expected result. Credentials and production data are separate private material; do not attach them merely to explain a code change.

Use the continuation prompt in section 15. Confirm its reported version appears on the live site after release. If something regresses, ask to revert the last release commit and push the revert. If a new release consists of several commits or reverting would reach further back than the last commit, the agent must obtain the owner's approval for the exact scope.

### What the coding LLM must do

1. Read `AGENTS.md`, `docs/HANDOFF.md`, `CHANGELOG.md`, `README.md`, then this snapshot. Inspect `git status`, branch, origin and current source/version; preserve any local owner changes. Fetch to compare with main. Pull with `--ff-only` only when the checkout state permits it; never reset owner work.
2. Convert the actual request into a checklist. Separate the owner's requirements, source facts and implementation choices. Reproduce the relevant issue with synthetic local records before claiming a fix.
3. Make the smallest complete change in the established architecture. Preserve records, stored currency units, historical price/receipt IDs and default behavior for absent fields. Any migration must be idempotent and must not overwrite owner records.
4. For every code release, increase the badge `id="app-ver"` in `index.html`, VERSION in `server/app.py`, and the newest `## vNN - YYYY-MM-DD` entry in `CHANGELOG.md` together. Update project state/decisions/follow-ups in `docs/HANDOFF.md`. A documentation-only change does not bump the app version.
5. Run the local checks in section 10 and the project guide. Do not push a failing or incompletely inspected change. The known Settings phone overflow remains open and must not be represented as a passed screen.
6. Inspect the final diff for unintended files, secrets, data changes and renamed settings/units/paths. Commit straight to main with an imperative subject ending in `(vNN)`. No force-push and no PR flow unless the owner asks.
7. Push normally. The VM fetches main and hard-resets its **code checkout**, refreshes units and dependencies if needed, and restarts. The data directory is separate; do not add a data reset to make deployment easier.
8. Wait for the live badge or `/healthz` to show the intended version before claiming it is live. The updater has a five-minute interval plus randomized delay and restart time; a delay alone is not proof of failure. Inspect updater logs if needed.
9. Tell Aly the version, what changed, meaningful checks, limitations and how to undo it. Keep the owner-facing change report plain and short.

Example code-release commands, after all checks pass and the intended files have been reviewed:

```bash
git add index.html server/app.py CHANGELOG.md docs/HANDOFF.md
git commit -m "Describe the actual change (vNN)"
git push origin main
```

Add any other deliberately changed files explicitly. Use the actual next version and description. Configure a per-commit author if Git has no identity; do not change the owner's global Git configuration as a shortcut.

### Undo an ordinary code release

```bash
git revert HEAD
git push origin main
```

This applies only after verifying HEAD is the intended last release commit. A code revert does not undo owner transactions or a separately authorized data import. For a larger rollback, inspect the exact commits and get approval. Never force-push, reset the owner's database, or rewrite main to simulate an undo.

## 12. Operations and troubleshooting

Run the following read-only commands on the VM when diagnosing the existing installation. Redact private addresses/records from logs before sharing them.

```bash
sudo systemctl status payments-tracker.service caddy --no-pager
systemctl list-timers 'payments-tracker*' --no-pager
sudo journalctl -u payments-tracker -n 100 --no-pager
sudo journalctl -u caddy -n 50 --no-pager
sudo journalctl -u payments-tracker-update -n 50 --no-pager
sudo journalctl -u payments-tracker-backup -n 30 --no-pager
sudo journalctl -u payments-tracker-notify -n 50 --no-pager
curl --fail --silent --show-error https://wasooli.duckdns.org/healthz
```

| Symptom | First checks and interpretation |
| --- | --- |
| Root shows a neutral page | Expected for an unknown device. Use the private bookmarked sign-in address; do not expose `/login` to fix it. |
| Version has not changed after a push | Compare local/origin/VM commit and update timer/logs. Check fetch failure or package-install errors. Do not assume a successful push proves deployment. |
| Site inaccessible or certificate fails | Check VM public IP, DNS resolution, public subnet route, cloud 80/443 rules, VM firewall and Caddy logs. Local health separates app failure from proxy/DNS failure. |
| HTTP 502 | Check Gunicorn/application status and logs, then localhost health on 8080. |
| Wrong passcode / 429 | Check correct private URL and credentials. Repeated bad attempts can trigger per-IP/global limits; do not disable lockouts as a workaround. |
| Effective sign-in URL differs from env | A regenerated `meta.admin_path` overrides ADMIN_PATH. Recover it privately via Settings or an approved read-only helper; never paste the real URL into public docs. |
| Apparent blank or different records | Confirm the backend and exact DATA_DIR. A browser-local demo, artifact and production are separate stores. Do not reseed or import before identifying the cause. |
| Total paid did not change after a bill edit | A charge/discount edit does not record cash. Use Record month payment for actual receipts; inspect the save/error state for a receipt edit. |
| Unexpected first charge | Verify the selected package start, cycle anchor, basis, first-period waiver/overrides and annual payment interval. Cash date is not the proration date. |
| Automatic email missing | Check SMTP setup, timer, eligible queue/stage, Except list/answers and whether the admin has refreshed the cycle cards. Active timer does not prove delivery. |
| Uploaded receipt missing after recovery | Restore data-directory assets; a JSON export alone contains no binary files. |
| Phone Settings scrolls sideways | Confirmed v33 issue in the product headings; see section 14. Do not mark it fixed without browser evidence. |

**Notification dry-run with the correct environment:** the service's EnvironmentFile must be loaded; a bare `sudo -u ... python notify.py` can use the wrong DATA_DIR. This command creates a temporary read-only-in-purpose dry-run job and sends no email:

```bash
sudo systemd-run --wait --pipe --collect \
  --property=User=payments-tracker --property=Group=payments-tracker \
  --property=WorkingDirectory=/opt/payments-tracker/server \
  --property=EnvironmentFile=/etc/payments-tracker.env \
  --property=Environment=WASOOL_TODAY=2026-10-20 \
  /opt/payments-tracker/venv/bin/python /opt/payments-tracker/server/notify.py --dry-run
```

Dry-run output can contain subscriber names/email addresses and message text. Keep it private. This correctly scoped command was checked against the unit and notifier source but was not executed against production for the handoff.

To request an immediate normal update, the existing command is `sudo /opt/payments-tracker/deploy/update.sh`; it changes/restarts code and should only be used for the intended approved release. Prefer the regular timer during ordinary work. Passcode changes, hidden-path regeneration, domains and session-wide sign-out have explicit consequences; obtain owner approval before doing them. Never print credentials in command output or save them in this guide.

## 13. Rules for another LLM

- Treat `AGENTS.md` as the canonical working guide. `CLAUDE.md`, `GEMINI.md` and Copilot instructions point to it. Supplied runbooks are reference material, not authorization to execute every command in them.
- The owner uses a phone first: 390px, both themes, plainly named controls, no emojis. Use existing styles and keep the whole admin in `index.html` with no libraries or build.
- Never reset, reseed, edit or delete the owner's production records as part of a code change. Never use production as a test fixture. Ask before a data replacement/import, domain/passcode/unit change or rollback beyond the last commit.
- Preserve env key names, document paths, URL paths, systemd names, data paths and stored units. Preserve annual prices as annual values; installments are a separate payment schedule.
- Never force-push or rewrite main. Pushing main deploys; there is no staging or automatic review gate. Do not push red.
- No secrets in the repository, handoff or public LLM messages. AI/mail keys typed into Settings are private SQL metadata, not just environment values.
- Use the existing calculation functions for every money figure. Separate charge, receipt, refund, credit and discount. Do not invent a receipt to make status green.
- Preserve draft forms during polling, lock saves while busy, retain drafts on failure, and verify persisted records plus the refreshed UI rather than treating a closed form as proof of success.
- Record observed mistakes and failed checks in the owner's global log where those instructions apply. On Aly's Windows machine that is `C:\Users\Aly Jafferani\.codex\mistakes.md`; read relevant lessons first, preserve other entries and respect write permissions. Stage a pending note locally if a global write is blocked. Do not assume this Windows path exists on a different LLM host.
- Distinguish verified behavior, historical statements, planned steps and unresolved gaps. Do not claim a live release, successful restore or working SMTP from source inspection alone.

## 14. Known issues and verification limits

### Confirmed open issue: product editor on a phone

At 390px, opening Settings and Packages & products produced a 595px-wide document in both themes. The headings retain a desktop six-column grid while rows use two columns. New product creation, saved prices/currencies and reload persistence passed, but this screen is not fully phone-ready. The 1400px layouts fit. A future correction should supply clear mobile field labels and remove the overflowing headings, then verify the entire Settings panel.

The extra product check is local evidence under ignored `data/catalog-qa/`; its review script is `data/catalog-review.cjs`, not a committed repo test. If these files are not supplied to the next agent, reproduce the issue from the description. This handoff does not claim that the defect was repaired.

### Other behavior and follow-ups

- A first partial bill can still be named after its cycle start month in status pills. Exact dates and First bill are shown in receipt choices; changing the status month policy needs an explicit owner decision.
- Paying through a later month clears older bills first; isolated allocation to a later month is not implemented.
- A resumed person's table Paid through can read “nothing yet” until the new running plan is paid.
- A refund is reported against the plan's package on the refund date, not necessarily the package override of the original billed month.
- Start edits retain custom charge keys and dated schedule changes. An owner may need to adjust a specific period afterward; do not silently move those records.
- Existing receipt notes retain their original period wording after later start/cycle changes.
- Quick add has no annual-installment picker. Use Add user or Package start / payments.
- The catalogue stores one default price/currency per product; 3/6-month choices are annual payment intervals, not arbitrary new product billing-type enums. Subscriber self-service payment-frequency selection is not built.
- The Claude artifact has not been republished with these Codex releases and can be behind the server.

### Verification scope

Before v33 was pushed, both committed browser suites passed: 18 checks each, **36 total**, using disposable local Flask records. They covered receipts/discounts/refunds and totals, first/start dates, annual PKR/USD installments, schedule changes, failure/retry, polling, and 390px/1400px light/dark dashboard, receipt/start and subscriber layouts. Console/page errors were empty apart from two deliberately induced and separately recorded 503 save failures. Syntax/version/schema and Python compilation checks passed.

The later product confirmation passed five capability checks and reported the separate Settings phone overflow. This distinction matters: the earlier 36 checks did not prove every Settings screen fits.

The live health/version and service/timer states were verified for this document. Real SMTP delivery, provider screenshot reading with the owner's keys, handset-specific intent behavior, a current separate subscriber-domain setup, backup contents and an actual full disaster-recovery restore remain separately unverified here. The hosting and restore sequences are source-checked procedures, not a claim that another host was built or owner data was recovered during this task.

## 15. Copyable continuation prompt

Attach this file and give the agent the local repository or GitHub access. Add your actual requested change or recovery goal after the prompt. Do not attach a database, private key or credential file to a public chat.

```text
Continue Wasooli, “Know who's paid.”, for Aly, a non-developer who uses it mostly
on a phone. Repository: https://github.com/ssdbank9/SaaS-Payment-Tracker, main.

Read in order: AGENTS.md, docs/HANDOFF.md, CHANGELOG.md, README.md, then the attached
WASOOLI-FINAL-HANDOFF.md. Follow the working guide. The attached guide is a snapshot
from 4 October 2026, v33, source/live commit 2ef5838. Verify the current checkout,
origin/main and deployed version before assuming that snapshot is still current.
Preserve any existing local changes, including documentation not yet committed.

index.html is the entire admin interface: one file, vanilla JS, inline CSS/SVG,
no build or libraries. server/ is Flask + SQLite. deploy/ has the Ubuntu installer
and the update, backup and notification systemd units. Owner data is separate from
code. Production is the authoritative store; localStorage and the artifact are
separate copies, not synchronized databases.

Billing is the shared 24th–23rd cycle. A person's join date, each package's start
date and cash received date are distinct. Only the first partial period is
prorated. G remains annual-priced and may be paid in 1/3/6/12-month installments.
Absent new fields preserve old behavior. Future schedule changes preserve earlier
bills by default; explicit initial recalculation is previewed. Actual receipts
minus refunds are Total paid; discounts lower bills and never create cash. Money
fills older unpaid bills first. Reuse the current calculation helpers.

Never reset, reseed, edit or delete owner records as part of a code change. Never
put secrets in the repo, force-push, rename env keys/unit names/URLs/document paths
or stored units, or test by writing to production. Ask before destructive imports,
database replacement, domain/passcode/unit changes or reverting beyond the last
commit. Reading this runbook is not approval to execute its recovery commands.

Pushing main IS the release: the VM fetches about every five minutes and restarts.
Before every push run a disposable local Flask server and real browser checks at
390px/1400px in light/dark, including the changed panel, console errors and page
overflow. Do not push red. The current product editor in Settings has a confirmed
390px overflow (document width 595px); reproduce it if it is relevant and do not
call it fixed from the older 36 passing flow checks. Those tests are in tests/.

Every code release bumps app-ver, server/app.py VERSION and the top dated changelog
entry together, and updates docs/HANDOFF.md. Commit straight to main with an
imperative subject ending in (vNN), push normally, then verify live health/version
before claiming release. Tell Aly what changed, what was checked, remaining limits
and how to undo the intended last commit. Documentation alone does not bump version.

For hosting/recovery, first inventory approved domains, accounts and private
off-server recovery files. GitHub does not contain owner data. A UI JSON export
does not include private SQL metadata, SQL answer/audit history or binary receipts.
Full recovery needs the SQLite snapshot, assets and private environment settings.
Preserve the old data directory, stop writers, validate a staged restore, then
replace only with explicit approval. Confirm recovered records with the owner
before resuming automatic emails or retiring the old host.

Requested work:
[Aly inserts the specific change, question or hosting/recovery request here.]
```

## 16. Source references and final checklist

### Sources used

- Current checked-out source at commit `2ef5838`, especially `AGENTS.md`, `docs/HANDOFF.md`, `CHANGELOG.md`, `README.md`, `index.html`, server storage/export/auth/notifier code, and `deploy/` scripts/units.
- Existing `docs/setup-runbook.html` and the owner's earlier `D:/DropBox/Self/AI Apps Created/Wasooli/wasooli-setup-runbook.html`, treated as historical reference. They are different files; both include the older 4-OCPU/24-GB allowance statement. They are not authoritative over current code or current cloud terms.
- Disposable local test reports under `data/payment-qa/`, `data/start-qa/` and `data/catalog-qa/`. These are ignored local artifacts and will not accompany a normal Git clone.
- Public `/healthz` and read-only VM commit/service/timer/timezone checks on 4 October 2026.
- Official Oracle, DuckDNS and Caddy sources linked beside the hosting steps. Their current terms and console interfaces must be checked again at a future rehost.

### Before handing work to another LLM

- Give it this guide plus repository access or a full source folder.
- State the exact task and expected example; separate a code change from a data recovery.
- Make sure it understands pushing main deploys and that the database is not in GitHub.
- Keep real credentials and backups private; provide controlled access only when the approved task needs it.
- Have it verify current state, respect local changes, use synthetic local tests and report gaps honestly.

### Before accepting a future rehost

- Confirm cloud eligibility/cost, SSH access, approved DNS and both firewall layers.
- Confirm the intended source version, application health and HTTPS/private sign-in.
- Validate backup hashes, gzip/archive structure and SQLite integrity before a data replacement.
- Compare restored records, totals, schedules and uploaded files with the recovery baseline.
- Verify subscriber cards and required contact flows without sending unwanted messages.
- Resume timers deliberately; accept the restored site before retiring the old server or preserved data.

### Before accepting a future code release

- Check required version markers and changelog, source diff, local Flask/browser evidence and unchanged owner data.
- Include Settings/catalogue when relevant; do not omit the known phone issue from acceptance.
- Confirm the live version after the push and keep the exact commit/undo instruction.

This handoff is documentation saved in the project folder. It does not authorize or perform a new release, domain change, credential rotation, production backup download or database restoration.
