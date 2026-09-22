# Changelog

Version numbers here summarise the development history of the app. The version numbers shown inside the published artifact may differ from these.

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
