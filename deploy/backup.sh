#!/usr/bin/env bash
# Nightly SQLite backup into $DATA_DIR/backups, keeping the newest 30.
# Uses SQLite's online backup API through the venv's Python, so it is safe
# while the service is running. Run by payments-tracker-backup.timer.
set -euo pipefail
DATA_DIR=${DATA_DIR:-/var/lib/payments-tracker}
APP_DIR=${APP_DIR:-/opt/payments-tracker}
KEEP=${KEEP:-30}
PY="$APP_DIR/venv/bin/python"
[ -x "$PY" ] || PY=python3
mkdir -p "$DATA_DIR/backups"
stamp=$(date +%Y%m%d-%H%M%S)
out="$DATA_DIR/backups/tracker-$stamp.sqlite3"
"$PY" - "$DATA_DIR/tracker.sqlite3" "$out" <<'PYEOF'
import sqlite3, sys
src = sqlite3.connect(sys.argv[1]); dst = sqlite3.connect(sys.argv[2])
with dst: src.backup(dst)
dst.close(); src.close()
PYEOF
gzip -f "$out"
# receipts change rarely; keep one rolling copy next to the database backups
if [ -d "$DATA_DIR/assets" ]; then
  tar -czf "$DATA_DIR/backups/assets-latest.tar.gz" -C "$DATA_DIR" assets
fi
ls -1t "$DATA_DIR"/backups/tracker-*.sqlite3.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
echo "backup: wrote $out.gz ($(ls -1 "$DATA_DIR"/backups/tracker-*.sqlite3.gz | wc -l) kept)"
