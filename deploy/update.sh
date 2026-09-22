#!/usr/bin/env bash
# Pull the latest main from GitHub; if it moved, reinstall requirements when they
# changed, install/refresh the systemd units and enable every timer, and restart the service.
# Run by payments-tracker-update.timer every 5 minutes (as root). Idempotent.
set -euo pipefail
APP_DIR=${APP_DIR:-/opt/payments-tracker}
SERVICE=${SERVICE:-payments-tracker}
BRANCH=${BRANCH:-main}
cd "$APP_DIR"

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

git fetch --quiet origin "$BRANCH" || { echo "update: fetch failed (offline?)"; ensure_units; exit 0; }
local_sha=$(git rev-parse HEAD)
remote_sha=$(git rev-parse "origin/$BRANCH")
if [ "$local_sha" = "$remote_sha" ]; then
  ensure_units
  exit 0
fi
echo "update: $local_sha -> $remote_sha"
req_before=$(sha256sum server/requirements.txt | cut -d' ' -f1)
git reset --quiet --hard "origin/$BRANCH"
req_after=$(sha256sum server/requirements.txt | cut -d' ' -f1)
if [ "$req_before" != "$req_after" ]; then
  echo "update: requirements changed, installing"
  "$APP_DIR/venv/bin/pip" install --quiet -r server/requirements.txt
fi
ensure_units
chmod +x deploy/*.sh
systemctl restart "$SERVICE"
echo "update: restarted $SERVICE at $(git rev-parse --short HEAD)"
