# Wasool · SaaS Payment Tracker

**Know who's paid.**

A single-file web app for tracking subscriber payments for a small SaaS. It keeps a list of users and their packages (C, C Max or G), runs everyone on a shared billing cycle anchored on the 24th with prorated first periods, records amounts in USD and PKR using a default exchange rate, supports one-time items, tracks costs and net, offers WhatsApp tap-to-send reminders, and can import costs from a statement screenshot.

## Live app

The app runs as a Claude artifact at https://claude.ai/artifact/TirjtbYSsbjrMweoV3P4PA. In the artifact, data is shared across devices and screenshot reading works.

Opening `index.html` directly in a browser also runs the app, but with per-device local storage and without screenshot reading.

## Files

- `index.html` - the whole app (markup, styles and script) in one file. It detects where it runs: the claude.ai artifact (shared `db`), your own server (the `/api/docs` store below) or a plain file (browser-local storage).
- `server/` - the self-hosted backend: Flask + SQLite, no build step (`app.py` routes, `db.py` storage, `auth.py` passcode login, `claude_read.py` screenshot reading).
- `deploy/` - `setup.sh` one-command installer, `update.sh` auto-deploy, `backup.sh`, and the systemd units.
- `CHANGELOG.md` - version history.

## Development

1. Edit `index.html`.
2. Open it locally in a browser to test.
3. Republish the artifact.

## Self-hosting on Oracle Cloud (free)

The same `index.html` runs on your own VM with a small Python server, so it works on your phone even when your desktop is off, keeps the data in SQLite on the VM, and adds one-tap **confirmation links** for your users.

### Prerequisites

1. An **Oracle Cloud Always Free** compute instance: shape *VM.Standard.A1.Flex* (Ampere, arm64), image *Ubuntu 22.04 or 24.04*, any size (1 OCPU / 6 GB is plenty). Note its public IP.
2. In the instance's **VCN → subnet → Security List** (or its Network Security Group) add two ingress rules: TCP **80** and TCP **443** from `0.0.0.0/0`. Oracle blocks these at the cloud level by default; the installer opens the VM's own firewall but cannot touch this one.
3. A subdomain: an **A record** such as `wasool.yourdomain.com → <public IP>` at your DNS provider. HTTPS is automatic once it resolves.
4. SSH access as the `ubuntu` user.

### The one command

```bash
curl -fsSL https://raw.githubusercontent.com/ssdbank9/SaaS-Payment-Tracker/main/deploy/setup.sh \
  | sudo DOMAIN=wasool.yourdomain.com ADMIN_PASSCODE='a-long-passcode-you-will-type-once' bash
```

It installs `python3-venv`, `git` and Caddy (official apt repo), clones this repository to `/opt/payments-tracker`, creates a virtualenv with the pinned `server/requirements.txt`, writes `/etc/payments-tracker.env` (passcode, a generated `SECRET_KEY`, `DATA_DIR=/var/lib/payments-tracker`, `DOMAIN`), installs the systemd units, writes `/etc/caddy/Caddyfile` with `reverse_proxy 127.0.0.1:8080` (Caddy fetches and renews the certificate), opens ports 80/443 in iptables and persists them with `netfilter-persistent`, starts everything and prints a health check plus the steps left to do. Re-running it is safe; it repairs the install or changes the domain and passcode. Leave `ADMIN_PASSCODE`/`DOMAIN` off the command line and it asks for them.

Then open `https://wasool.yourdomain.com` on your phone, sign in with the passcode (the session lasts 60 days) and use *Add to Home Screen*: the page ships a manifest and icon, so it behaves like an app. Nothing here depends on your desktop being on.

### How updates deploy

`payments-tracker-update.timer` runs `deploy/update.sh` every 5 minutes on the VM: `git fetch`; if `origin/main` moved it hard-resets the checkout to it, reinstalls requirements if `server/requirements.txt` changed, re-copies the systemd units if they changed, and restarts the service. Pushing to `main` on GitHub is the whole release process, and no secret ever lives in the repository (they are only in `/etc/payments-tracker.env` on the VM).

### Moving your data from the claude.ai page

1. On the claude.ai artifact: **Settings → Your data → Export everything (JSON)**. One file with every user, payment, cost, reminder tick and setting.
2. On your server: **Settings → Your data → Import everything (JSON)…** and pick that file. It replaces the users and costs with the file's contents (so the sample users seeded on a fresh server disappear) and copies the settings.

The two copies do not sync afterwards; pick one as the place you work. CSV import/export still works in both.

### Confirmation links

Every user gets a private token (22 random URL-safe characters, stored as `confirmToken` on the user record). Their page is `https://<your domain>/c/<token>`: "Hi *first name*, your *package* payment of *amount* for *period* is due on *date*. Will you continue and pay by *reply-by*?" with **YES / NO** buttons and an optional note. It shows only the first name, package, amount and dates; nothing else about the account. A second visit shows the recorded answer with a *Change my answer* option.

- Put `{confirm_link}` in the reminder or final-notice template, or leave it out and the link is appended to the message automatically (`Reply here: …`) whenever a link exists.
- The reminder run and the Final notice list have a **Copy link** button per user and show the recorded answer (*Replied YES · Sep 22, 10:18*, with the note). The existing Reminded / Confirmed ticks stay yours to set, so you can override anything.
- Answers are stored in the `confirmations` table with the cycle start, time, IP and browser, and returned by `GET /api/confirmations?cycle=YYYY-MM-DD`.
- On the server the **Public base URL** setting is filled in from the address bar. In the claude.ai copy you can paste your server address there to include links in messages sent from the artifact (the pages themselves are served by your server, so the data must be there).

### Backups

`payments-tracker-backup.timer` runs `deploy/backup.sh` nightly at 03:15: an online SQLite backup gzipped into `/var/lib/payments-tracker/backups/` (the newest 30 kept) plus a rolling `assets-latest.tar.gz` of uploaded receipts. To restore, stop the service, `gunzip` a backup over `/var/lib/payments-tracker/tracker.sqlite3`, start the service. Copying the `backups/` folder somewhere off the VM now and then is a good idea; **Export everything (JSON)** is the portable alternative.

### Screenshot reading with Claude (optional)

Set `ANTHROPIC_API_KEY=sk-ant-...` in `/etc/payments-tracker.env` and run `sudo systemctl restart payments-tracker`. The server then forwards statement screenshots and pasted text to the Claude Messages API with `claude-haiku-4-5-20251001` (both *Quick* and *Default* in Settings use Haiku here) and the *Import from screenshot* panel turns on. Without a key the panel explains that reading is off and still parses pasted text line by line. Your key never reaches the browser.

### Operations

- Service: `sudo systemctl status payments-tracker`, logs `journalctl -u payments-tracker -f`, Caddy logs `journalctl -u caddy -f`.
- Change the passcode: edit `/etc/payments-tracker.env`, then `sudo systemctl restart payments-tracker`.
- Health: `https://<domain>/healthz` (no login) returns `{"ok": true, "app": "wasool", ...}`.
- Login is rate limited (8 failures per IP per 15 minutes); state-changing API calls need the `X-Requested-With: wasool` header the page sends; the admin cookie is HttpOnly, Secure, SameSite=Lax.
- Everything lives in `/var/lib/payments-tracker`; the code in `/opt/payments-tracker` is disposable.
