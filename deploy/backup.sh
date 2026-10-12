#!/usr/bin/env bash
# Nightly backup into $DATA_DIR/backups:
#   - an online SQLite backup (safe while the service runs), checked with PRAGMA integrity_check before it is
#     kept; the newest $KEEP (30) are retained;
#   - the uploaded receipts as a dated archive assets-YYYYMMDD.tar.gz (the newest $KEEP_ASSETS, 14, are retained)
#     plus assets-latest.tar.gz (a copy of the newest, the name the recovery guide uses).
# Every file is written to a temporary name and moved into place, so a failed or interrupted run never leaves a
# broken or half-written backup, and it never deletes an older good one. Run by payments-tracker-backup.timer.
# v42: integrity check, atomic receipt archives, dated receipt copies (before: one assets-latest.tar.gz overwritten in place each night).
set -euo pipefail
DATA_DIR=${DATA_DIR:-/var/lib/payments-tracker}
APP_DIR=${APP_DIR:-/opt/payments-tracker}
KEEP=${KEEP:-30}
KEEP_ASSETS=${KEEP_ASSETS:-14}
PY="$APP_DIR/venv/bin/python"
[ -x "$PY" ] || PY=python3
B="$DATA_DIR/backups"
mkdir -p "$B"
stamp=$(date +%Y%m%d-%H%M%S)
out="$B/tracker-$stamp.sqlite3"
if ! "$PY" - "$DATA_DIR/tracker.sqlite3" "$out" <<'PYEOF'
import pathlib, sqlite3, sys
# v45: open the live database read-only (a missing file is an error, never a new empty database) and require the docs table
src_path = pathlib.Path(sys.argv[1])
if not src_path.is_file():
    print("database not found: " + str(src_path)); sys.exit(3)
src = sqlite3.connect(src_path.resolve().as_uri() + "?mode=ro", uri=True)
if not src.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='docs'").fetchone():
    print("database has no docs table: " + str(src_path)); sys.exit(3)
dst = sqlite3.connect(sys.argv[2])
with dst:
    src.backup(dst)
res = dst.execute("PRAGMA integrity_check").fetchone()[0]
dst.close(); src.close()
if res != "ok":
    print("integrity_check failed: " + str(res)); sys.exit(2)
PYEOF
then
  rm -f "$out"
  echo "backup: FAILED (the database copy could not be made or is not intact); older backups were kept" >&2
  exit 1
fi
gzip -f "$out"
if [ -d "$DATA_DIR/assets" ]; then
  day=$(date +%Y%m%d)
  tmp=$(mktemp "$B/.assets.XXXXXX")
  if tar -czf "$tmp" -C "$DATA_DIR" assets; then
    mv -f "$tmp" "$B/assets-$day.tar.gz"
    cp -f "$B/assets-$day.tar.gz" "$B/.assets-latest.tmp" && mv -f "$B/.assets-latest.tmp" "$B/assets-latest.tar.gz"
  else
    rm -f "$tmp"
    echo "backup: the receipts archive failed; the previous receipt copies were kept" >&2
  fi
fi
# v45: "|| true" because an empty match (no dated receipt archive yet) must not fail the whole run under pipefail
{ ls -1t "$B"/tracker-*.sqlite3.gz 2>/dev/null || true; } | tail -n +"$((KEEP + 1))" | xargs -r rm -f
{ ls -1t "$B"/assets-2*.tar.gz 2>/dev/null || true; } | tail -n +"$((KEEP_ASSETS + 1))" | xargs -r rm -f
echo "backup: wrote $out.gz ($( { ls -1 "$B"/tracker-*.sqlite3.gz 2>/dev/null || true; } | wc -l) database backups, $( { ls -1 "$B"/assets-2*.tar.gz 2>/dev/null || true; } | wc -l) receipt archives kept)"
