#!/usr/bin/env bash
# Pull the latest main from GitHub; if it moved, reinstall requirements when they
# changed, install/refresh the systemd units and enable every timer, and restart the service.
# Run by payments-tracker-update.timer every 5 minutes (as root). Idempotent.
set -euo pipefail
APP_DIR=${APP_DIR:-/opt/payments-tracker}
SERVICE=${SERVICE:-payments-tracker}
BRANCH=${BRANCH:-main}
ENV_FILE=${ENV_FILE:-/etc/payments-tracker.env}
cd "$APP_DIR"
PENDING="$APP_DIR/.restart-pending"
# v42: if an earlier run switched the code but the restart did not finish, finish it first (before, that run's failure was never retried)
if [ -f "$PENDING" ]; then
  echo "update: an earlier update did not finish restarting; restarting $SERVICE now"
  systemctl restart "$SERVICE" && rm -f "$PENDING" || { echo "update: restart still failing" >&2; exit 1; }
fi

# Make sure every unit in deploy/systemd is installed and every timer is enabled, even when
# nothing new was pulled: a unit added by a previous pull (for example the notify timer)
# is picked up on the next run without a manual step. All of this is idempotent.
ensure_units() {
  local changed=0 f name
  for f in deploy/systemd/*.service deploy/systemd/*.timer; do
    [ -f "$f" ] || continue
    name=$(basename "$f")
    if ! cmp -s "$f" "/etc/systemd/system/$name"; then
      cp "$f" "/etc/systemd/system/$name"; changed=1
    fi
  done
  [ "$changed" = 1 ] && { echo "update: systemd units changed, reloading"; systemctl daemon-reload; }
  for f in deploy/systemd/*.timer; do
    [ -f "$f" ] || continue
    name=$(basename "$f")
    systemctl is-enabled --quiet "$name" 2>/dev/null || { echo "update: enabling $name"; systemctl enable --quiet --now "$name" || true; }
  done
  return 0
}

# v25: settings a newer version needs get a default appended to the env file, so the running VM picks them up
# on its next pull without anyone touching the file. ADMIN_PATH is the secret part of the sign-in address
# (https://DOMAIN/x/<ADMIN_PATH>); the app shows it in Settings -> Security. Restarts the service when it added one.
ensure_env() {
  [ -f "$ENV_FILE" ] || return 0
  local added=0
  if ! grep -q '^ADMIN_PATH=' "$ENV_FILE"; then
    local p; p=$(head -c 18 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\n')
    printf '\n# v25: the sign-in form lives only at https://<DOMAIN>/x/$ADMIN_PATH (shown in Settings -> Security)\nADMIN_PATH=%s\n' "$p" >> "$ENV_FILE"
    echo "update: added ADMIN_PATH to $ENV_FILE"; added=1
  fi
  if ! grep -q '^SESSION_DAYS=' "$ENV_FILE"; then
    printf '# how long a signed-in device stays signed in (renewed on every visit)\nSESSION_DAYS=90\n' >> "$ENV_FILE"; added=1
  fi
  if [ "$added" = 1 ]; then
    systemctl restart "$SERVICE" && echo "update: restarted $SERVICE for the new env settings"
  fi
  return 0
}

git fetch --quiet origin "$BRANCH" || { echo "update: fetch failed (offline?)"; ensure_units; ensure_env; exit 0; }
local_sha=$(git rev-parse HEAD)
remote_sha=$(git rev-parse "origin/$BRANCH")
if [ "$local_sha" = "$remote_sha" ]; then
  ensure_units
  ensure_env
  exit 0
fi
echo "update: $local_sha -> $remote_sha"
req_before=$(sha256sum server/requirements.txt | cut -d' ' -f1)
req_new=$(git show "origin/$BRANCH:server/requirements.txt" | sha256sum | cut -d' ' -f1)
# v42: install the new requirements BEFORE switching the code. If pip fails the code stays as it was (the service keeps running a
# matching version), the run fails visibly, and the next run tries again; before, the code was switched first and a failed pip left
# the new code without its libraries and never retried.
if [ "$req_before" != "$req_new" ]; then
  echo "update: requirements changed, installing before switching the code"
  req_tmp=$(mktemp)
  git show "origin/$BRANCH:server/requirements.txt" > "$req_tmp"
  if ! "$APP_DIR/venv/bin/pip" install --quiet -r "$req_tmp"; then
    rm -f "$req_tmp"
    echo "update: pip install failed; staying on $local_sha and trying again on the next run" >&2
    exit 1
  fi
  rm -f "$req_tmp"
fi
touch "$PENDING"
git reset --quiet --hard "origin/$BRANCH"
ensure_units
chmod +x deploy/*.sh
if [ -f "$ENV_FILE" ] && ! grep -q '^ADMIN_PATH=' "$ENV_FILE"; then SERVICE_RESTART_DONE=1; ensure_env; else SERVICE_RESTART_DONE=0; fi
[ "${SERVICE_RESTART_DONE:-0}" = 1 ] || systemctl restart "$SERVICE" || { echo "update: restart failed; it will be retried on the next run" >&2; exit 1; }
rm -f "$PENDING"
echo "update: restarted $SERVICE at $(git rev-parse --short HEAD)"
