# Wasooli · Changelog

Version numbers here summarise the development history of the app. The version numbers shown inside the published artifact may differ from these.

## v29 - 2026-09-26

- **Record payment in one tap.** The period box that needs money next (the red or grey box for the coming month) now has its own **Record payment** button, and the plan's Record payment button opens the same thing: a question in that box, "Record Rs 4,200 for 24 Oct – 23 Nov 2026?", with a large **Yes, record Rs 4,200** button. Yes records that amount at once, dated today, in the plan's currency, with the note "for 24 Oct – 23 Nov 2026" in the payment history. The amount is exactly what the box shows as due for that period: after the plan's discount, proration of a first month, a hand-set amount or package for that month, and any credit already paid toward it (a box that says "Rs 4,200 less Rs 2,000 credit" asks for Rs 2,200). **Different amount** opens a short form (amount, currency, date, optional note) with a **Record** button; **Not now** closes the question. One-time items ask the same question for what is left. Editing a payment still uses the full form (Edit in the payment history), and **Paid up to…** is unchanged.
- Why it went in circles before: the only thing to tap on a period box was "edit amount / package", which changes what the month costs and never records a payment; Record payment lived in the plan's header and opened a six-field form ending in Save payment. On the server, Save then only wrote the record and waited for the page's next check with the server (4 seconds, 30 in a background tab) before redrawing, so the box and the row often still said Unpaid for a moment and looked as if nothing had happened. Now every save puts the change on screen the instant the server has accepted it. The "edit amount / package" form also says plainly that it changes what is owed and does not record a payment.
- Two payments on the same day are both kept. Before, saving a payment quietly replaced any earlier payment on the same plan with the same date, so paying October and then November on the same day left only one of them.
- **The dashboard says which month is paid.** The status pill on each user row and on each plan now reads **Paid for Oct** (paid through the current cycle), **Paid to Nov** (paid ahead), **Overdue for Oct** or **Overdue for Sep – Oct**, **Due today for Oct**, **Open balance for Oct**; a yearly plan reads **Paid for 2026–27**. The month is the one the billing cycle starts in (24 Oct – 23 Nov is "Oct"); hovering the pill shows the exact dates. The "Due Nov 24" column says "paid for Nov" instead of "paid" when the coming cycle is already covered. Cancelled, Ended, Starts later and a one-time item's Paid are unchanged. Server VERSION and the badge are 29.

## v28 - 2026-09-25

- **Refunds**: every plan (and every one-time item that has a payment) has a **Refund** button next to Record payment. It records money you gave back: date (today by default), amount, currency (the plan's by default), rate (blank = the default rate, as for payments) and a reason. Before you save, a line says what it will do: which month's revenue it comes off, how "paid through" moves, and whether a period becomes unpaid again.
- A refund comes off revenue in the month of its date everywhere money is added up: a new **Refunds** tile on the Summary, a Refunds column in **By product** (taken off the package the plan was on that day), and in Analytics (Collected all time shows the refunds, the month table has a Refunds column, the net line and the cumulative "collected so far" are after refunds). **Net = collected − refunds − costs**, so profit is exact. The PKR/USD toggle and the ranges work as for payments.
- A refund also takes the money back out of what the plan has paid, so the period it paid for shows as unpaid again. Tick **Also cancel** in the refund form if the person is leaving: it uses the normal cancellation with a last day (by default the last day still paid for after the refund), and nothing is billed after it. For a cancelled user, a period up to the last day that a refund made short counts at what they kept ("kept after refund" on the period box), so a refund on leaving does not leave a balance; removing the refund puts it back.
- Refunds show in the plan's payment history as **Refund −Rs 4,200** in red, with Edit and Remove like payments. The plan shows "Paid in · refunded · kept". The user's Paid column is after refunds. Export and Import everything carry refunds (they are part of the user's record). On phones the history's Edit / Remove now wrap instead of running off the card, and the Summary tiles no longer draw a box around their small print.
- Hand-off for other AI coding tools: `AGENTS.md` is now the main guide for any coding assistant (Codex, Cursor, Gemini CLI, Copilot, Jules, Aider and Claude Code); `CLAUDE.md`, `GEMINI.md` and `.github/copilot-instructions.md` point to it. `docs/HANDOFF.md` has a "Continuing with another AI tool" section. Server VERSION and the badge are 28.

## v27 - 2026-09-25

- **One month on another package**: the edit form on a period box (and on a Queue row) now has **Package for this period** next to the amount. Pick C Max for one month and that month is billed at C Max's price (less the plan's discount, prorated if it is the first period); type an amount as well and the typed amount wins. The period box shows a dashed package tag and "Billed as C Max this period · plan is C". **Reset to computed** clears both the amount and the package. It is kept with the period's other hand-set values (`periodOverrides[periodStart].packageId`; absent = the plan's normal package), so balances, credit, the Summary, By product (money paid for that month counts for C Max), Analytics, the Queue message and the link page all use it. A package with no price set can still be picked; type the amount.
- **Paid up to… → Clear**: the "or a date" field has a **Clear** button (iPhone date pickers have no clear of their own). It removes the typed date and puts the cycle list and the total back to the default.
- **Cancel subscription on the phone**: the buttons at the top of an expanded user now wrap onto more lines. Before, they sat on one line that did not wrap inside a card that hides anything past its edge, so on a phone the last button, Cancel subscription, was pushed out of view for everyone except Eren, whose shorter "add phone" and "Telegram" buttons left it half visible. Edit user and Cancel subscription now form their own row with bigger touch targets. Cancelling works for the whole user, as before.
- **Resume subscription** (was Reactivate) for cancelled users: pick the date to resume from (today by default). Billing restarts on that date, prorated to the next cycle, on the same package, price, discount and currency; nothing is billed for the days between the last day and the resume date. Only plans the cancellation ended come back. The cancellation is kept as history, shown on the user as "Cancelled · last day … · resumed … · not billed …". Server VERSION and the badge are 27.

## v26 - 2026-09-23

- **Analytics** tab (header button next to Queue and Settings): headline tiles for active users, cancelled users, monthly recurring amount (current prices of running plans, yearly ÷ 12), collected, costs and net all time; **Users per package** as a horizontal bar chart (active, cancelled as a lighter segment) with a list of active, cancelled, monthly recurring, collected, costs and net per package; **Collected vs costs by month** with a net line and a table of the last 12 months (collected, costs, net, cumulative net); **Cumulative: money made vs cost** as two lines with the current gap labelled; and **Outstanding** by package and by user. Charts are inline SVG with tooltips on hover, tap and keyboard focus, a table under each, chart colours as their own light/dark tokens (`--chart-1`, `--chart-1-soft`, `--chart-2`, validated for colour-vision safety), and they stack for a 390px phone. Everything follows the PKR/USD toggle and the default rate, and the figures come from the same functions as the Summary (`breakdownRows`, `monthlySeries`, `analyze`), so the tab's totals equal the tiles and the By product table.
- Guide for future changes: `CLAUDE.md` at the repo root describes the app, the three backends, the deploy pipeline, the data model, conventions (version badge + server `VERSION` + CHANGELOG per change, artifact and repo `index.html` identical, local Flask + Playwright check, no force-push), how to run locally and a UI checklist; README gains **Making changes** for the owner (describe the change on claude.ai/code, Claude commits to `main`, the VM updates itself within 5 minutes; how to roll back; where data and backups live). Server VERSION and the badge are 26.

## v25 - 2026-09-23

- Lockout per visitor, never for the owner: wrong passcodes are counted for the IP that typed them (Caddy's `X-Forwarded-For`, trusted only from localhost), so 8 failures in 15 minutes lock that device alone (`429`, `Retry-After`) and a stranger can no longer lock the owner out; a gentle global brake (`LOGIN_GLOBAL_PER_MINUTE`, default 60 attempts a minute across every IP) answers `429` for a minute during a flood; lockouts and the brake are logged with the IP; an already signed-in session is never touched.
- Hidden sign-in address: the login form exists only at `https://<DOMAIN>/x/<ADMIN_PATH>` (`ADMIN_PATH`, 24 random url-safe characters; `setup.sh` generates it, `update.sh` appends one to `/etc/payments-tracker.env` on a VM that has none and restarts). The plain address, `/login` and every unknown path show a neutral page (the Wasooli mark and "Nothing to see here.", no link, no hint; `200` at `/`, `404` elsewhere) unless the browser carries the signed **known-device** cookie every successful login sets for a year, in which case `/` redirects to the sign-in page, so the owner's own phone and PC always find it. Settings → **Security** shows the address with Copy, Open and **Regenerate** (kept in the `meta` table, wins over the env file) and the page shows a one-time banner asking the owner to bookmark it; `setup.sh` prints it at the end; `GET /api/security` serves it to the page. `/api/*` without a session stays `401` JSON.
- Remember this device: the session cookie lasts `SESSION_DAYS` (default 90) and is renewed on every request (Secure, HttpOnly, SameSite=Lax; sessions issued by v24 stay valid). **Sign out** sits in the header and in Settings → Security; **Sign out everywhere** bumps a signing-key version stored in the data store (`secret_version`), which invalidates every session at once without editing the env file (this browser stays a known device).
- Separate address for the subscribers' links: optional `LINK_DOMAIN`. `setup.sh` writes one Caddyfile serving `DOMAIN` and `LINK_DOMAIN` (and `OLD_DOMAIN`, a previous admin domain that now redirects to the new one) to the same app; the app reads the Host header: on the link address only `/c/<token>`, `/assets/*`, `/healthz` and the manifest exist and everything else is the neutral `404`; on the admin address `/c/<token>` redirects to the link address. Links built by the page (Queue, Reminder run, WhatsApp, the confirm documents) and by `notify.py` use `https://<LINK_DOMAIN>` automatically (the server passes `linkBase` in `window.__PT_SERVER__` and `/healthz`; the **Public base URL** field is locked while it is set). `setup.sh` keeps every existing env value when re-run (passcode, `SECRET_KEY`, `ADMIN_PATH`, API keys, unmanaged lines), never prompts when piped, and re-running it with `LINK_DOMAIN=…` only adds the host and reloads Caddy. Server VERSION and the badge are 25.

## v24 - 2026-09-23

- Renamed to **Wasooli** with a real logo: a rounded green tile carrying a white W whose last stroke turns into a check mark (paid = done), a "Wasooli" wordmark in IBM Plex Sans and the tagline "Know who's paid." The mark is inline SVG in the header (light and dark), the favicon and the login and public choice pages; `assets/` holds `logo.svg`, `mark.svg`, PNG icons (32, 180, 192, 512, 512 maskable) and `manifest.webmanifest`, which Flask serves at `/assets/<file>` and `/manifest.webmanifest`, so "Add to home screen" on the server shows the Wasooli icon and name (the claude.ai and browser-local copies draw the same mark on a canvas). Every user-visible "Wasool" became "Wasooli" (page titles, Settings defaults and placeholders, email subjects and from name, `/healthz` now says `"app": "wasooli"`, the JSON export is `wasooli-export-<date>.json`); a stored app name of "Wasool" reads as the default. Repo paths, systemd unit names, `/etc/payments-tracker.env`, data paths and the domain are unchanged.
- Period tiles wrap on phones: the expanded plan card used to be as wide as the 960px table, so on a phone only the first two and a half period boxes were in view and the rest looked missing. Below 760px the card is now the visible width and sticks to the left edge while the table scrolls; below 700px the period boxes lay out two per row (an open edit form takes the full row), so all of a plan's periods are visible without sideways scrolling.
- Warning on retroactive amount edits: the edit-amount form (period boxes and Queue rows) shows a yellow inline note before Save when the typed amount would make an already-covered period short ("This makes Aug 24 – Sep 23 short by $18 and marks Eren overdue; paid-through moves from Nov 23 to Aug 23."), with a **Reset to computed** link that puts the computed amount back. Saving an amount re-renders the row, the plan box, Paid through and the totals at once.
- Dimmed settled rows: users whose every active plan is paid through the current cycle (and paid one-time items), and plan boxes that are paid up, render at reduced emphasis with a muted status pill so unpaid and overdue rows stand out; hovering, focusing or expanding restores full strength, and secondary text keeps a readable contrast in both themes. Settings → **Dim paid-up users** (on by default) turns it off. Server VERSION and the badge are 24.

## v23 - 2026-09-22

- Google Gemini as a second reading provider: Settings → **AI reading** now has a **Provider** choice (Anthropic / Google Gemini) with one key field each (kept on the server in the `meta` table, masked on read, never exported) and, for Gemini, a **model picker**: **Load models** calls `/api/ai-models`, which asks the Gemini API for the models this key can use, keeps those that support `generateContent` and read pictures, lists Flash-Lite first, then Flash, newest first, and preselects the newest model whose name has both "flash" and "lite" (a stable one before a preview); *Type a model id…* stays as a fallback. `server/gemini_read.py` sends pictures as `inline_data` with the same prompt and JSON row structure as the Claude path (`responseMimeType: application/json`, with a text-parsing retry for models that refuse it); `/api/read-image` dispatches on the selected provider and `/api/ai-test` validates it with one tiny request, repeating the API's own error text ("API key not valid. Please pass a valid API key."). The status pill reads "Working (Gemini · gemini-…)", "Gemini key saved · pick a model", etc. Stores from v22 keep working as Anthropic; the Anthropic path is unchanged.
- Pictures read the moment they are picked: **Choose picture** (several at once), **Take photo**, Ctrl+V paste and drag-drop anywhere on the import panel all show a thumbnail with a **Reading…** spinner and then append the extracted rows (checkbox, editable cells, tagged "image 1/2/3") for the **Apply** button; each thumbnail has **Read again**. Photos are shrunk in the browser first (long side 1600px, JPEG 0.85; small PNG screenshots pass through), so phone pictures upload quickly. On the server without a key the buttons stay visible, a picked picture is kept with the "isn't set up yet" notice and its jump button, and Read again works once a key is saved; an API error is shown inline with the picture kept for a retry. Server VERSION and the badge are 23.

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
