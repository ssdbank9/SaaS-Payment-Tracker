# Changelog

Version numbers here summarise the development history of the app. The version numbers shown inside the published artifact may differ from these.

## v18 - 2026-09-22

- The starter data now matches the owner's real records on every backend: fixed 30-day proration (Ataullah's first period is 23 days × Rs 140 = Rs 3,220), Tabraiz charged 24 days with his Rs 4,200 payment on Sep 22 leaving Rs 840 credit, Eren paid through Nov 23, Haroon's second C account with its waived stub plus the yearly G plan, Mohib under maggdoto@gmail.com, and no Uqba.
- Schema migration 11 reconciles an existing store to the same values once: it pins the fixed 30-day basis, fills the default rate, packages (C at Rs 4,200, G yearly), anchor and reminder days, and lets the existing per-user migrations add Tabraiz's 24-day override and payment, Eren's last payment, Haroon's second account and Mohib's email; payments recorded since are untouched.
- Root cause: the seed wrote the schema marker before the settings document, so an interrupted first load left a store that read as fully migrated but had no proration basis, and every later load returned early. Settings are now written first and the marker last, by one writer (the old ones also dropped the Public base URL), and the migration waits for a running seed.

## v17 - 2026-09-22

- Each user row now shows the WhatsApp number and Telegram handle under the name and email, so contact details are visible without opening the row.
- The header Settings button reads "Home" while Settings is open and takes you back to the user list.
- An expanded user reads as a distinct card: green 2px border, rounded corners, soft shadow, a left accent bar and a tinted background, with the summary row framed in the same green. The palette is tightened around a deep green primary and applied to section headings, the payments sub-table header, period cards and primary buttons, in light and dark mode.

## v15 - 2026-09-22

- The app is now called **Wasool** ("Know who's paid."), with an editable name and tagline in Settings, a home-screen icon and web-app manifest, and a Reading model setting (Quick or Default) that drives Claude's screenshot, statement-text and Quick add reading.
- Self-hosting: a Python server (`server/`, Flask + SQLite, pinned requirements) that serves the same `index.html`, a passcode login, a JSON document store at `/api/docs` mirroring the artifact `db` API, receipt uploads, JSON export/import of everything, and optional screenshot reading through the Claude API (`claude-haiku-4-5-20251001`) when `ANTHROPIC_API_KEY` is set.
- The frontend detects its backend: claude.ai artifact, own server (`window.__PT_SERVER__` or `/healthz`) or browser-local. On a server, CSV exports download as files and the sync badge reads "Saved on your server".
- Confirmation links: each user gets a private `/c/<token>` page with the reminder's amount, period and dates and YES / NO buttons plus a note. `{confirm_link}` placeholder, Copy link buttons and recorded answers in the reminder run and Final notice; answers via `GET /api/confirmations?cycle=`.
- Settings: Public base URL (auto-filled on the server) and a "Your data" block with Export everything (JSON) and Import everything (JSON).
- Deploy: `deploy/setup.sh` one-command installer for Oracle Cloud Always Free (Ubuntu arm64) with Caddy HTTPS, iptables rules, systemd service, a 5-minute GitHub auto-update timer and a nightly SQLite backup timer. README gains a "Self-hosting on Oracle Cloud (free)" section.

## v14 - 2026-09-22

- Proration basis setting: fixed 30-day month or actual days in the month, with a per-plan override.
- Each prorated period's days charged, daily rate or amount charged can be edited; an edited period carries a "discounted" tag.
- Per-plan Discount, as a percentage or a fixed amount.
- Data migrations recording Eren's and Tabraiz's payments.

## v13 - 2026-09-22

- "Paid up to" action: records one payment per period up to a chosen billing cycle, so reminders resume only after that cycle. A Months helper counts the periods.
- Run reminders with an Except list: skip or unskip a user for the current cycle; skipped users are left out of the run and of the Final notice step.

## v12 - 2026-09-22

- Final notice step for users who have not confirmed by the reply-by day: a not-confirmed list with email addresses, a copy button and CSV export of the deactivation list, a final-notice message template with one-tap WhatsApp, Telegram and email sends, a per-cycle "Final notice sent" tick, a Deactivate action that opens the cancel flow, and a reply-by-day banner.

## v11 - 2026-09-22

- A user can hold a second monthly plan (for example two C accounts); reminder text lists every plan and its amount.
- "Waive first partial period" plan option, for users whose first prorated stretch should not be charged.

## v10 - 2026-09-22

- Telegram contact field with one-tap send, alongside WhatsApp and email.
- Contact and data migrations that fill in phone numbers, emails, joining dates and plans for the seeded users.

## v9 - 2026-09-22

- Email one-tap: a mailto link carrying the reminder template sits beside every WhatsApp control.
- Cancel subscription flow: record the last day, reason and a refund note; cancelling ends the user's plans, keeps any owed balance, and removes them from reminders and the active list.
- Status filter: active, cancelled or all users.
- Reactivate: resume the previous plan or start a fresh prorated plan.
- CSV export gains status and last_day columns.

## v8 - 2026-09-22

- Removed the Uqba seed record via a guarded migration (runs once per data store, never re-adds).
- Quick add for users: paste free-form text (names, numbers, packages) and review the parsed rows in a table before saving. Parsing uses Claude with a regex fallback, flags duplicates against existing users, and can record an optional first payment.
- Compact two-tap Add user form, with a "More options" section for the less common fields.

## v7 - 2026-09-22

- Package billing cycles: monthly, yearly and one-time. C and C Max bill monthly; G bills yearly (Haroon is on the G yearly plan alongside C).
- Shared billing anchor of 24 July 2026 for every package, with day-based proration for users joining mid-period and any overpayment carried forward as credit.
- Per-plan prorate toggle, so proration can be switched off for an individual plan.
- All dates and fields are editable, including per-user package assignments and billing dates.
- Packages and products can be added as new offerings launch.
- Reminders panel: the 20th is the reminder day, the 23rd is the reply-by date, with reminded and confirmed ticks tracked per billing cycle.

## v6 - 2026-09-22

- Packages C, C Max and G, with a package filter and a per-package breakdown.
- A user can be on more than one package at the same time.

## v5 - 2026-09-22

- Screenshot import: read costs from a statement screenshot.

## v4 - 2026-09-22

- USD and PKR amounts with a default exchange rate of 280.
- Costs and net figures alongside collections.

## v3 - 2026-09-21

- Packages per user.

## v2 - 2026-09-21

- Billing periods, user names, one-time items and balance due.
- Seeded the initial 7 users.

## v1 - 2026-09-21

- Initial tracker: users, monthly payments and WhatsApp payment links.
