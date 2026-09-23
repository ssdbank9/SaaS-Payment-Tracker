#!/usr/bin/env bash
# Wasooli (Payments Tracker) - one-shot installer for a fresh Ubuntu 22.04/24.04 VM
# (Oracle Cloud Always Free Ampere A1, arm64, or any Ubuntu box).
#
#   curl -fsSL https://raw.githubusercontent.com/ssdbank9/SaaS-Payment-Tracker/main/deploy/setup.sh \
#     | sudo DOMAIN=wasooli.duckdns.org ADMIN_PASSCODE='choose-a-long-passcode' bash
#
# Later, to give the subscribers' links their own address (v25), re-run with LINK_DOMAIN:
#   curl -fsSL .../deploy/setup.sh | sudo DOMAIN=wasooli.duckdns.org LINK_DOMAIN=pay-up.duckdns.org bash
#
# Idempotent: run it again to repair, or to change DOMAIN / LINK_DOMAIN / ADMIN_PASSCODE. Values you leave
# off the command line are kept from /etc/payments-tracker.env (passcode, SECRET_KEY, ADMIN_PATH, API keys...).
# It never prompts when it is piped (stdin is not a terminal): a missing DOMAIN or passcode is an error.
# What it does: installs python3-venv, git and Caddy; clones or updates the repo in /opt/payments-tracker;
# creates a venv; writes /etc/payments-tracker.env; installs the systemd units (service, 5-minute GitHub
# auto-update, nightly backup, daily reminder emails); writes the Caddyfile for DOMAIN (+ LINK_DOMAIN,
# + a previous domain as a redirect); opens ports 80/443 in iptables and persists them.
#
#   setup.sh --env-only   only computes and writes ENV_FILE (used by the tests with ENV_FILE=/tmp/...).
set -euo pipefail

REPO_URL=${REPO_URL:-https://github.com/ssdbank9/SaaS-Payment-Tracker.git}
BRANCH=${BRANCH:-main}
APP_DIR=${APP_DIR:-/opt/payments-tracker}
DATA_DIR=${DATA_DIR:-/var/lib/payments-tracker}
ENV_FILE=${ENV_FILE:-/etc/payments-tracker.env}
SERVICE_USER=${SERVICE_USER:-payments-tracker}
APP_NAME="Wasooli"
ENV_ONLY=0
[ "${1:-}" = "--env-only" ] && ENV_ONLY=1

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*" >&2; }
die() { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# ---- prompts: only when a terminal is attached; when piped from curl a missing value is an error ----
ask() { # ask VAR "prompt" "default" [secret]
  local var=$1 prompt=$2 def=$3 secret=${4:-} val=""
  if [ -t 0 ]; then
    if [ -n "$secret" ]; then read -r -s -p "$prompt" val; echo; else read -r -p "$prompt" val; fi
  fi
  val=${val:-$def}
  [ -n "$val" ] || die "$var is required. Pass it as an environment variable: sudo $var=... bash"
  printf -v "$var" '%s' "$val"
}
existing_env() { [ -f "$ENV_FILE" ] && sed -n "s/^$1=//p" "$ENV_FILE" | head -1 | sed 's/^"\(.*\)"$/\1/'; }
norm_host() { echo "$1" | tr 'A-Z' 'a-z' | sed 's#^https\?://##; s#/.*$##; s#:.*$##'; }
random_path() { head -c 18 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\n'; }  # 24 url-safe characters

# ---- values: command line > existing env file > prompt/default ----
PREV_DOMAIN=$(existing_env DOMAIN || true)
DOMAIN=${DOMAIN:-$PREV_DOMAIN}
if [ -z "${DOMAIN:-}" ]; then
  host_hint=$(hostname -d 2>/dev/null || true)
  ask DOMAIN "Domain for $APP_NAME (an A record must point here), e.g. wasooli.${host_hint:-yourdomain.com}: " ""
fi
DOMAIN=$(norm_host "$DOMAIN")
[[ "$DOMAIN" =~ ^[a-z0-9.-]+$ ]] || die "DOMAIN '$DOMAIN' does not look like a hostname"

LINK_DOMAIN=${LINK_DOMAIN-$(existing_env LINK_DOMAIN || true)}
LINK_DOMAIN=$(norm_host "${LINK_DOMAIN:-}")
[ -z "$LINK_DOMAIN" ] || [[ "$LINK_DOMAIN" =~ ^[a-z0-9.-]+$ ]] || die "LINK_DOMAIN '$LINK_DOMAIN' does not look like a hostname"
[ "$LINK_DOMAIN" != "$DOMAIN" ] || die "LINK_DOMAIN must differ from DOMAIN (it is the separate address for the subscribers' links)"

# a previous admin domain stays served as a redirect to the new one: OLD_DOMAIN=... names it, the domain the
# env file had before a DOMAIN change is taken automatically, and OLD_DOMAIN= (empty) on the command line drops it
if [ -z "${OLD_DOMAIN+x}" ]; then
  OLD_DOMAIN=$(existing_env OLD_DOMAIN || true)
  if [ -n "$PREV_DOMAIN" ] && [ "$(norm_host "$PREV_DOMAIN")" != "$DOMAIN" ]; then OLD_DOMAIN=$PREV_DOMAIN; fi
fi
OLD_DOMAIN=$(norm_host "${OLD_DOMAIN:-}")
[ -z "$OLD_DOMAIN" ] || [[ "$OLD_DOMAIN" =~ ^[a-z0-9.-]+$ ]] || die "OLD_DOMAIN '$OLD_DOMAIN' does not look like a hostname"
[ "$OLD_DOMAIN" != "$DOMAIN" ] && [ "$OLD_DOMAIN" != "$LINK_DOMAIN" ] || OLD_DOMAIN=""

ADMIN_PASSCODE=${ADMIN_PASSCODE:-$(existing_env ADMIN_PASSCODE || true)}
if [ -z "${ADMIN_PASSCODE:-}" ]; then
  ask ADMIN_PASSCODE "Admin passcode for $APP_NAME (12+ characters; you will type it on your phone once): " "" secret
fi
[ "${#ADMIN_PASSCODE}" -ge 8 ] || die "ADMIN_PASSCODE must be at least 8 characters"
SECRET_KEY=${SECRET_KEY:-$(existing_env SECRET_KEY || true)}
[ -n "${SECRET_KEY:-}" ] || SECRET_KEY=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
ADMIN_PATH=${ADMIN_PATH:-$(existing_env ADMIN_PATH || true)}
[ -n "${ADMIN_PATH:-}" ] || ADMIN_PATH=$(random_path)
[[ "$ADMIN_PATH" =~ ^[A-Za-z0-9_-]{16,80}$ ]] || die "ADMIN_PATH must be 16-80 letters, digits, - or _"
SESSION_DAYS=${SESSION_DAYS:-$(existing_env SESSION_DAYS || true)}
[[ "${SESSION_DAYS:-}" =~ ^[0-9]+$ ]] || SESSION_DAYS=90
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-$(existing_env ANTHROPIC_API_KEY || true)}
APP_TZ=${APP_TZ:-$(existing_env APP_TZ || true)}
# any other key already in the file (added by hand or by a later version) is carried over untouched
MANAGED_KEYS='DOMAIN|LINK_DOMAIN|OLD_DOMAIN|ADMIN_PASSCODE|SECRET_KEY|ADMIN_PATH|SESSION_DAYS|DATA_DIR|COOKIE_SECURE|ANTHROPIC_API_KEY|APP_TZ'
EXTRA_LINES=""
if [ -f "$ENV_FILE" ]; then
  EXTRA_LINES=$(grep -Ev "^\s*(#|$|($MANAGED_KEYS)=)" "$ENV_FILE" || true)
fi

write_env() {
  say "Writing $ENV_FILE"
  local tmp tz_line="" extra=""
  [ -z "${APP_TZ:-}" ] || tz_line="APP_TZ=$APP_TZ"
  [ -z "$EXTRA_LINES" ] || extra=$(printf '# kept from the previous file\n%s' "$EXTRA_LINES")
  tmp=$(mktemp)
  umask 077
  cat > "$tmp" <<ENV
# $APP_NAME (Payments Tracker) - read by systemd. Restart after editing:
#   sudo systemctl restart payments-tracker
DOMAIN=$DOMAIN
# v25: optional separate address for the subscribers' links (https://LINK_DOMAIN/c/<token>); set with
#   sudo DOMAIN=$DOMAIN LINK_DOMAIN=pay-up.duckdns.org bash setup.sh
LINK_DOMAIN=$LINK_DOMAIN
# a previous admin address, kept as a redirect to DOMAIN (empty = none)
OLD_DOMAIN=$OLD_DOMAIN
ADMIN_PASSCODE=$ADMIN_PASSCODE
SECRET_KEY=$SECRET_KEY
# v25: the sign-in form lives only at https://$DOMAIN/x/\$ADMIN_PATH (also shown in Settings -> Security)
ADMIN_PATH=$ADMIN_PATH
# how long a signed-in device stays signed in (renewed on every visit)
SESSION_DAYS=$SESSION_DAYS
DATA_DIR=$DATA_DIR
COOKIE_SECURE=1
$tz_line
# Optional: lets the app read statement screenshots with Claude (Haiku 4.5).
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
$extra
ENV
  sed -i '/^$/d' "$tmp"  # drop the blank lines left by empty optional parts
  umask 022
  mv "$tmp" "$ENV_FILE"
  chmod 640 "$ENV_FILE"
  if [ "$ENV_ONLY" = 0 ]; then chown root:"$SERVICE_USER" "$ENV_FILE"; fi
}

if [ "$ENV_ONLY" = 1 ]; then
  write_env
  echo "sign-in address: https://$DOMAIN/x/$ADMIN_PATH"
  if [ -n "$LINK_DOMAIN" ]; then echo "link address:    https://$LINK_DOMAIN"; else echo "link address:    (same as DOMAIN)"; fi
  echo "old domain:      ${OLD_DOMAIN:-(none)}"
  exit 0
fi

[ "$(id -u)" -eq 0 ] || die "run as root: sudo DOMAIN=... ADMIN_PASSCODE=... bash setup.sh"
command -v apt-get >/dev/null || die "this installer needs Ubuntu/Debian (apt-get)"

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
write_env

# ---- systemd ----
say "Installing systemd units"
cp "$APP_DIR"/deploy/systemd/*.service "$APP_DIR"/deploy/systemd/*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --quiet --now payments-tracker.service
systemctl enable --quiet --now payments-tracker-update.timer
systemctl enable --quiet --now payments-tracker-backup.timer
systemctl enable --quiet --now payments-tracker-notify.timer
systemctl restart payments-tracker.service

# ---- Caddy (automatic HTTPS): every host goes to the same app, which tells them apart by the Host header ----
HOSTS="$DOMAIN"
[ -z "$LINK_DOMAIN" ] || HOSTS="$HOSTS, $LINK_DOMAIN"
[ -z "$OLD_DOMAIN" ] || HOSTS="$HOSTS, $OLD_DOMAIN"
say "Configuring Caddy for $HOSTS"
cat > /etc/caddy/Caddyfile <<CADDY
# $APP_NAME (Payments Tracker). Caddy obtains and renews the certificates itself.
# $DOMAIN: the admin app.${LINK_DOMAIN:+  $LINK_DOMAIN: the subscribers' link pages only.}${OLD_DOMAIN:+  $OLD_DOMAIN: redirects to $DOMAIN.}
$HOSTS {
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
link_resolved=""
[ -z "$LINK_DOMAIN" ] || link_resolved=$(getent ahostsv4 "$LINK_DOMAIN" 2>/dev/null | awk '{print $1}' | head -1 || true)
# the address regenerated from Settings -> Security (kept in the database) wins over the env file
effective_path=$("$APP_DIR/venv/bin/python" - "$DATA_DIR/tracker.sqlite3" "$ADMIN_PATH" <<'PY' 2>/dev/null || echo "$ADMIN_PATH"
import json, sqlite3, sys
try:
    row = sqlite3.connect("file:%s?mode=ro" % sys.argv[1], uri=True).execute("SELECT value FROM meta WHERE key='admin_path'").fetchone()
    v = json.loads(row[0]) if row else ""
    print(v if isinstance(v, str) and 16 <= len(v) <= 80 else sys.argv[2])
except Exception:
    print(sys.argv[2])
PY
)

if [ -n "$LINK_DOMAIN" ]; then links_line="https://$LINK_DOMAIN/c/<token>  (separate address, never shows where you sign in)"
else links_line="https://$DOMAIN/c/<token>  (add LINK_DOMAIN=... to give them their own address)"; fi
old_line=""; [ -z "$OLD_DOMAIN" ] || old_line="  Old address:    https://$OLD_DOMAIN redirects to the new one.
"
link_dns_line=""; [ -z "$LINK_DOMAIN" ] || link_dns_line="     and            $LINK_DOMAIN -> $public_ip  (currently resolves to: ${link_resolved:-nothing yet}).
"
cat <<DONE

$APP_NAME is installed.

  Sign in here:   https://$DOMAIN/x/$effective_path
                  Bookmark this. It is the only place the sign-in form exists; the plain
                  https://$DOMAIN shows strangers a blank page (also in Settings -> Security).
  Passcode:       the ADMIN_PASSCODE you set (kept in $ENV_FILE)
  Links:          $links_line
$old_line  Data:           $DATA_DIR (SQLite + receipts; nightly backups in $DATA_DIR/backups)
  Updates:        every 5 minutes the VM checks GitHub ($BRANCH) and restarts on a new commit
  Emails:         payments-tracker-notify.timer runs daily at 09:00 PKT once SMTP is set in Settings -> Mail
  Logs:           journalctl -u payments-tracker -f      /      journalctl -u caddy -f

Still to do on your side:
  1. DNS: an A record  $DOMAIN -> $public_ip  (currently resolves to: ${resolved:-nothing yet}).
$link_dns_line     Caddy fetches the HTTPS certificates automatically once the records are live.
  2. Oracle Cloud: in the VCN's subnet Security List (or NSG) add ingress rules for
     TCP 80 and TCP 443 from 0.0.0.0/0. The VM firewall is already open; the cloud one is not.
  3. Open the sign-in address above on your phone, sign in, then Settings -> "Import everything (JSON)"
     with the file exported from the claude.ai page. Add the page to your home screen.
  4. Optional: screenshot reading: Settings -> AI reading (Gemini or Anthropic key).
DONE
