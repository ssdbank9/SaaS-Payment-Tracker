# SaaS Payment Tracker

A single-file web app for tracking subscriber payments for a small SaaS. It keeps a list of users and their packages (C, C Max or G), runs everyone on a shared billing cycle anchored on the 24th with prorated first periods, records amounts in USD and PKR using a default exchange rate, supports one-time items, tracks costs and net, offers WhatsApp tap-to-send reminders, and can import costs from a statement screenshot.

## Live app

The app runs as a Claude artifact at https://claude.ai/artifact/TirjtbYSsbjrMweoV3P4PA. In the artifact, data is shared across devices and screenshot reading works.

Opening `index.html` directly in a browser also runs the app, but with per-device local storage and without screenshot reading.

## Files

- `index.html` - the whole app (markup, styles and script) in one file.
- `CHANGELOG.md` - version history.

## Development

1. Edit `index.html`.
2. Open it locally in a browser to test.
3. Republish the artifact.
