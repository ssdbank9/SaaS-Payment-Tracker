# Changelog

Version numbers here summarise the development history of the app. The version numbers shown inside the published artifact may differ from these.

## v22 - 2026-09-22

- Editable amount per period: every current or upcoming period box in an expanded plan has **edit amount**, and every Queue row has **✎ edit amount** next to the figure that goes into the message; both open the same small inline form (amount prefilled with the computed one, a **Discount** shortcut that takes `10%` or `500` and fills the amount, a note such as "Eid discount" or "correction", Save, and **Reset to computed** once an amount is set). The entry is kept per plan as `periodOverrides[periodStart] = {amount, note, at}`; absent means the computed amount, so nothing changes for existing records. The first period's "Amount charged" field now writes the same entry, while an older `prorationAmountOverride` is still read.
- The set amount is the period's amount everywhere: balance due and the outstanding tile, credit carried forward, per-user dues, the By product table, `{amount}` in the stage messages (shown at once in the Queue, less any credit that already applies, which the form spells out), the link-page document and therefore the public `/c/<token>` page and the `notify.py` emails. Boxes show a **custom** tag with the computed amount struck through and the note; recorded payments are untouched. Server VERSION and the badge are 22.

## v21 - 2026-09-22

- Costs per product: every cost (Add cost, Edit, screenshot/text import rows, the costs CSV `product` column) can be tagged to a package or left **Shared / unassigned**; costs recorded before v21 stay shared. The Summary's "By package" table is now **By product**: for each package the users on it, what was collected in the chosen range (each payment counted for the tier of the periods it covers, so a C → C Max switch sends the later months' money to C Max), the costs tagged to it, the net and the outstanding balance, in PKR with USD equivalents at the default rate, plus a Shared row and a Total row that matches the tiles. Editing a cost no longer drops its receipt link or source.
- Screenshot reading configurable from the site: Settings → **AI reading** (self-hosted only) stores the Anthropic API key on the server via `/api/ai-settings` (masked on read, never exported) with a **Test** button (`/api/ai-test`, one request that costs no tokens and reports the API's own error message, e.g. "API key is invalid.") and a status pill (Not set up / Key saved · not tested / Working / Not working). `/api/read-image` uses the stored key first and `ANTHROPIC_API_KEY` in `/etc/payments-tracker.env` as the fallback. The import panel shows "Screenshot reading isn't set up yet: paste an API key in Settings → AI reading" with a button that jumps there instead of hiding the caption inside the hidden drop zone, and gains **Choose picture** / **Take photo** buttons that work on a phone.
- Billing cycle start day: Settings now reads "Billing cycle starts on day [24] of each month" plus the month yearly plans renew in (together they form the anchor, shown as a preview). The day is kept as its own `cycleDay` setting, so 29–31 survive: every cycle start is that day clamped to the month's last day (Feb 28, then back to the 31st). Changing it recomputes periods, proration, due dates, the Queue stages, the link-page documents and the daily email job (`notify.py` mirrors the rule).
- WhatsApp app choice: Settings → **WhatsApp opens in** (Regular WhatsApp by default, WhatsApp Business, or Ask via the wa.me page). On Android, Regular and Business use an `intent://send…#Intent;scheme=whatsapp;package=com.whatsapp[.w4b];S.browser_fallback_url=…;end` link that forces that app; on iPhone and desktop Regular uses `whatsapp://send`, the others `wa.me`. Applies to every WhatsApp button (row, expanded panel, Queue, Reminder run, Final notice). Help line: "Or on your phone: Settings → Apps → WhatsApp Business → Open by default → Clear defaults."
- Currency and price when adding a user: the Add user form's package, price and **Currency (pays in)** fields are prefilled from the package default and clearly labelled; Quick add keeps its Pays in column; the row's plan cell, the plan box and the plan Edit form show and change the currency.
- Button audit (server mode, 390px and 1400px): every button in a collapsed row, the expanded panel, the Queue / Reminder run / Final notice tabs, Settings and the import dialog was clicked. Fixed: **Paid up to…** appeared on plans that have ended (no next period) and did nothing; the import panel's "reading is off" caption sat inside the hidden drop zone so the panel looked broken without a key; Choose picture / Take photo did not exist on a phone. Server VERSION and the badge are 21.

## v20 - 2026-09-22

- Subscriber choice page: `/c/<token>` is now a mobile-first page for the coming billing cycle ("24 Sep – 23 Oct 2026") showing each monthly plan as a box (account, tier, price, amount due or "already paid") with three large buttons: **Continue**, **Upgrade to C Max** (or **Move back to C** when already on C Max; "Change to <tier>" for other package names) and **Discontinue**, plus an optional note. Users with more than one account (Haroon) get one set of buttons per box. Answers can be changed until the reply-by day; afterwards the page says the account continues as it is. Answers are stored as continue / upgrade / downgrade / discontinue with the plan and target package (older YES/NO answers read as continue / discontinue); the server renders the page from the SQLite store and checks the token is still the user's current one.
- Answers are shown per user in the Reminder run and Final notice ("↗ Upgrade → C Max · Sep 22, 19:29 · applied", with the note) and applied to the records once (the server stamps `applied_at`): continue ticks Confirmed; upgrade or downgrade appends a `tierHistory` entry from the next cycle start at the package's default price (falling back to the plan's price, marked "price to confirm") with an "Account upgraded · via link" tag on the plan; discontinue marks the user "Discontinue requested (from Sep 24)" in the table, in the expanded row and in the Final notice list with a one-tap **Confirm cancel** that runs the existing cancel flow with the last day set to the period end (a single account of a multi-account user just ends that plan). A changed answer resets the earlier one. On the claude.ai or browser-local copies there are no server answers, so nothing changes there.
- Queue: the header button and the first tab of the Reminders panel show today's stage from the date: stage 1 (reminder) from the reminder day, stage 2 (repeat, to anyone without an answer) from the reply-by day, stage 3 (final note: the account continues from the cycle start at the current tier, with the amount due and how to pay) on the cycle start day. Each row has the fully rendered message with the user's private link and the three choices spelled out, WhatsApp / Telegram (+ Copy, since Telegram cannot prefill) / Email buttons, and a Sent tick that records `{stage, cycleStart, channel, at}`; counts read "4 to send · 2 sent"; the Except list still applies. Settings gains three editable stage templates (`{name} {amount} {cycle} {link} {tier} {dueDate} {replyBy} {switchLabel} {payHow}`) and a "How to pay" line.
- Email automation: Settings → Mail (self-hosted only) stores SMTP host, port, user, app password and from name on the server via `/api/mail-settings` (the password is never returned) with a "Send test email to me" button (`/api/mail-test`). `server/notify.py`, run by the new `payments-tracker-notify.timer` daily at 09:00 Asia/Karachi, emails today's stage to every user with an email who has not had it for this cycle (skipping people who answered or are on the Except list), ticks them as sent (channel "email", marked auto in the Queue) and logs; without SMTP it logs "mail not configured" and exits 0. `deploy/update.sh` now installs missing units and enables every timer on each run, so the timer appears on an existing server without a manual step; `setup.sh` enables it too. Server VERSION and the badge are 20.

## v19 - 2026-09-22

- Every plan in an expanded user is its own framed box: a 2px green border with rounded corners, a tinted header strip naming the account (the email written into the plan label, such as Haroon's "Account 2 · Developerabdullahsnetflix@gmail.com", or the user's own email), the package as a badge, cycle, currency and price, the status pill and the plan's actions, with the period cards and payment table inside; boxes sit 12px apart and wrap on narrow screens. Single-plan users get the same box. No amounts or collapsed rows change.
- Change tier per plan (C ↔ C Max, or any package with the same billing cycle) from a chosen cycle start, kept as a per-plan `tierHistory` of `{from, packageId, price, currency, note}`: each period resolves to the latest entry on or before its start (the plan's own package and price remain the starting tier, and a later Change price still wins within a tier), so proration, discounts, credit and balances follow the tier's price; the header shows "Upgraded to C Max from Aug 24" or "Moves back to C from Sep 24", period cards carry the tier name, the collapsed PLAN column shows the current tier with an arrow marker, and any entry can be undone. Plans without a history are unchanged and no migration runs; nothing is seeded for anyone.

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
