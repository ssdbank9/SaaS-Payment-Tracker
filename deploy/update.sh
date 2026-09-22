#!/usr/bin/env bash
# Pull the latest main from GitHub; if it moved, reinstall requirements when they
# changed, refresh the systemd units when they changed, and restart the service.
# Run by payments-tracker-update.timer every 5 minutes (as root). Idempotent.
set -euo pipefail
APP_DIR=${APP_DIR:-/opt/payments-tracker}
SERVICE=${SERVICE:-payments-tracker}
BRANCH=${BRANCH:-main}
cd "$APP_DIR"
git fetch --quiet origin "$BRANCH" || { echo "update: fetch failed (offline?)"; exit 0; }
local_sha=$(git rev-parse HEAD)
remote_sha=$(git rev-parse "origin/$BRANCH")
if [ "$local_sha" = "$remote_sha" ]; then
  exit 0
fi
echo "update: $local_sha -> $remote_sha"
req_before=$(sha256sum server/requirements.txt | cut -d' ' -f1)
units_before=$(cat deploy/systemd/* | sha256sum | cut -d' ' -f1)
git reset --quiet --hard "origin/$BRANCH"
req_after=$(sha256sum server/requirements.txt | cut -d' ' -f1)
units_after=$(cat deploy/systemd/* | sha256sum | cut -d' ' -f1)
if [ "$req_before" != "$req_after" ]; then
  echo "update: requirements changed, installing"
  "$APP_DIR/venv/bin/pip" install --quiet -r server/requirements.txt
fi
if [ "$units_before" != "$units_after" ]; then
  echo "update: systemd units changed, reloading"
  cp deploy/systemd/*.service deploy/systemd/*.timer /etc/systemd/system/
  systemctl daemon-reload
fi
chmod +x deploy/*.sh
systemctl restart "$SERVICE"
echo "update: restarted $SERVICE at $(git rev-parse --short HEAD)"
