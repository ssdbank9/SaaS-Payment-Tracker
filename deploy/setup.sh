#!/usr/bin/env bash
# Wasooli (Payments Tracker) - one-shot installer for a fresh Ubuntu 22.04/24.04 VM
# (Oracle Cloud Always Free Ampere A1, arm64, or any Ubuntu box).
#
#   curl -fsSL https://raw.githubusercontent.com/ssdbank9/SaaS-Payment-Tracker/main/deploy/setup.sh \
#     | sudo DOMAIN=wasooli.example.com ADMIN_PASSCODE='choose-a-long-passcode' bash
#
# Idempotent: run it again to repair or to change DOMAIN / ADMIN_PASSCODE.
# What it does: installs python3-venv, git and Caddy; clones or updates the repo in
# /opt/payments-tracker; creates a venv; writes /etc/payments-tracker.env; installs the
# systemd units (service, 5-minute GitHub auto-update, nightly backup, daily reminder emails); writes the
# Caddyfile (automatic HTTPS); opens ports 80/443 in iptables and persists them.
set -euo pipefail

REPO_URL=${REPO_URL:-https://github.com/ssdbank9/SaaS-Payment-Tracker.git}
BRANCH=${BRANCH:-main}
APP_DIR=${APP_DIR:-/opt/payments-tracker}
DATA_DIR=${DATA_DIR:-/var/lib/payments-tracker}
ENV_FILE=${ENV_FILE:-/etc/payments-tracker.env}
SERVICE_USER=${SERVICE_USER:-payments-tracker}
APP_NAME="Wasooli"

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*" >&2; }
die() { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run as root: sudo DOMAIN=... ADMIN_PASSCODE=... bash setup.sh"
command -v apt-get >/dev/null || die "this installer needs Ubuntu/Debian (apt-get)"

# ---- prompts (stdin may be the script itself when piped from curl, so read from the terminal) ----
ask() { # ask VAR "prompt" "default" [secret]
  local var=$1 prompt=$2 def=$3 secret=${4:-} val=""
  if [ -r /dev/tty ]; then
    if [ -n "$secret" ]; then read -r -s -p "$prompt" val < /dev/tty; echo >/dev/tty; else read -r -p "$prompt" val < /dev/tty; fi
  fi
  val=${val:-$def}
  [ -n "$val" ] || die "$var is required. Pass it as an environment variable: sudo $var=... bash"
  printf -v "$var" '%s' "$val"
}
existing_env() { [ -f "$ENV_FILE" ] && sed -n "s/^$1=//p" "$ENV_FILE" | head -1 | sed 's/^"\(.*\)"$/\1/'; }

DOMAIN=${DOMAIN:-$(existing_env DOMAIN || true)}
if [ -z "${DOMAIN:-}" ]; then
  host_hint=$(hostname -d 2>/dev/null || true)
  ask DOMAIN "Domain for $APP_NAME (an A record must point here), e.g. wasooli.${host_hint:-yourdomain.com}: " ""
fi
DOMAIN=$(echo "$DOMAIN" | tr 'A-Z' 'a-z' | sed 's#^https\?://##; s#/.*$##')
[[ "$DOMAIN" =~ ^[a-z0-9.-]+$ ]] || die "DOMAIN '$DOMAIN' does not look like a hostname"

ADMIN_PASSCODE=${ADMIN_PASSCODE:-$(existing_env ADMIN_PASSCODE || true)}
if [ -z "${ADMIN_PASSCODE:-}" ]; then
  ask ADMIN_PASSCODE "Admin passcode for $APP_NAME (12+ characters; you will type it on your phone once): " "" secret
fi
[ "${#ADMIN_PASSCODE}" -ge 8 ] || die "ADMIN_PASSCODE must be at least 8 characters"
SECRET_KEY=${SECRET_KEY:-$(existing_env SECRET_KEY || true)}
[ -n "${SECRET_KEY:-}" ] || SECRET_KEY=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-$(existing_env ANTHROPIC_API_KEY || true)}

# ---- packages ----
export DEBIAN_FRONTEND=noninteractive
say "Installing packages (python3-venv, git, Caddy)"
apt-get update -qq
apt-get install -y -qq python3 python3-venv python3-pip git curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https >/dev/null
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy >/dev/null
fi

# ---- user, code, venv ----
say "Fetching $APP_NAME into $APP_DIR"
id -u "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" remote set-url origin "$REPO_URL"
  git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
  git -C "$APP_DIR" reset --quiet --hard "origin/$BRANCH"
else
  rm -rf "$APP_DIR"
  git clone --quiet --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
git config --global --add safe.directory "$APP_DIR" >/dev/null 2>&1 || true
chmod +x "$APP_DIR"/deploy/*.sh
[ -d "$APP_DIR/venv" ] || python3 -m venv "$APP_DIR/venv"
"$APP_DIR/venv/bin/pip" install --quiet --upgrade pip >/dev/null
"$APP_DIR/venv/bin/pip" install --quiet -r "$APP_DIR/server/requirements.txt"
mkdir -p "$DATA_DIR/assets" "$DATA_DIR/backups"
chown -R "$SERVICE_USER:$SERVICE_USER" "$DATA_DIR"
chmod 750 "$DATA_DIR"

# ---- environment ----
say "Writing $ENV_FILE"
umask 077
cat > "$ENV_FILE" <<ENV
# $APP_NAME (Payments Tracker) - read by systemd. Restart after editing:
#   sudo systemctl restart payments-tracker
DOMAIN=$DOMAIN
ADMIN_PASSCODE=$ADMIN_PASSCODE
SECRET_KEY=$SECRET_KEY
DATA_DIR=$DATA_DIR
COOKIE_SECURE=1
# Optional: lets the app read statement screenshots with Claude (Haiku 4.5).
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
ENV
umask 022
chown root:"$SERVICE_USER" "$ENV_FILE"
chmod 640 "$ENV_FILE"

# ---- systemd ----
say "Installing systemd units"
cp "$APP_DIR"/deploy/systemd/*.service "$APP_DIR"/deploy/systemd/*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --quiet --now payments-tracker.service
systemctl enable --quiet --now payments-tracker-update.timer
systemctl enable --quiet --now payments-tracker-backup.timer
systemctl enable --quiet --now payments-tracker-notify.timer
systemctl restart payments-tracker.service

# ---- Caddy (automatic HTTPS) ----
say "Configuring Caddy for https://$DOMAIN"
cat > /etc/caddy/Caddyfile <<CADDY
# $APP_NAME (Payments Tracker). Caddy obtains and renews the certificate itself.
$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8080
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Frame-Options "SAMEORIGIN"
	}
	log {
		output file /var/log/caddy/access.log
	}
}
CADDY
mkdir -p /var/log/caddy && chown caddy:caddy /var/log/caddy
caddy fmt --overwrite /etc/caddy/Caddyfile >/dev/null 2>&1 || true
systemctl enable --quiet --now caddy
systemctl reload caddy || systemctl restart caddy

# ---- firewall: Oracle's Ubuntu images ship an iptables INPUT chain that rejects everything but SSH ----
say "Opening ports 80 and 443 in iptables"
if command -v iptables >/dev/null; then
  for port in 80 443; do
    for fam in iptables ip6tables; do
      command -v $fam >/dev/null || continue
      $fam -C INPUT -p tcp --dport "$port" -m conntrack --ctstate NEW,ESTABLISHED -j ACCEPT 2>/dev/null \
        || $fam -I INPUT 1 -p tcp --dport "$port" -m conntrack --ctstate NEW,ESTABLISHED -j ACCEPT
    done
  done
  echo iptables-persistent iptables-persistent/autosave_v4 boolean true | debconf-set-selections
  echo iptables-persistent iptables-persistent/autosave_v6 boolean true | debconf-set-selections
  apt-get install -y -qq iptables-persistent netfilter-persistent >/dev/null
  netfilter-persistent save >/dev/null 2>&1 || true
fi
if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q '^Status: active'; then
  ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
fi

# ---- health check ----
say "Checking the service"
sleep 2
if curl -fsS http://127.0.0.1:8080/healthz >/dev/null; then
  echo "gunicorn answers on 127.0.0.1:8080: $(curl -fsS http://127.0.0.1:8080/healthz)"
else
  warn "the service is not answering yet; see: journalctl -u payments-tracker -n 50"
fi
public_ip=$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
resolved=$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1}' | head -1 || true)

cat <<DONE

$APP_NAME is installed.

  URL:            https://$DOMAIN
  Passcode:       the ADMIN_PASSCODE you set (kept in $ENV_FILE)
  Data:           $DATA_DIR (SQLite + receipts; nightly backups in $DATA_DIR/backups)
  Updates:        every 5 minutes the VM checks GitHub ($BRANCH) and restarts on a new commit
  Emails:         payments-tracker-notify.timer runs daily at 09:00 PKT once SMTP is set in Settings -> Mail
  Logs:           journalctl -u payments-tracker -f      /      journalctl -u caddy -f

Still to do on your side:
  1. DNS: an A record  $DOMAIN -> $public_ip  (currently resolves to: ${resolved:-nothing yet}).
     Caddy fetches the HTTPS certificate automatically once the record is live.
  2. Oracle Cloud: in the VCN's subnet Security List (or NSG) add ingress rules for
     TCP 80 and TCP 443 from 0.0.0.0/0. The VM firewall is already open; the cloud one is not.
  3. Open https://$DOMAIN on your phone, sign in, then Settings -> "Import everything (JSON)"
     with the file exported from the claude.ai page. Add the page to your home screen.
  4. Optional: put ANTHROPIC_API_KEY=sk-ant-... in $ENV_FILE and run
     sudo systemctl restart payments-tracker   to turn on screenshot reading.
DONE
