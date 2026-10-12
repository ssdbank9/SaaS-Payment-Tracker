#!/usr/bin/env bash
# v42 check of deploy/backup.sh on a disposable folder (never the owner's data).
# Run from the repository root:  bash tests/backup-script.sh   (set PYBIN to a python that has sqlite3 if python3 is missing)
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
PYBIN=${PYBIN:-$(command -v python3 || command -v python)}
mkdir -p "$T/app/venv/bin" "$T/data/assets"
printf '#!/usr/bin/env bash\nexec "%s" "$@"\n' "$PYBIN" > "$T/app/venv/bin/python"; chmod +x "$T/app/venv/bin/python"
"$PYBIN" -c "
import sqlite3,sys
c=sqlite3.connect(sys.argv[1]); c.execute('create table docs(path text)'); c.execute('create table t(x)'); c.executemany('insert into t values(?)',[(i,) for i in range(50)]); c.commit()" "$T/data/tracker.sqlite3"
echo receipt > "$T/data/assets/r1.txt"
export DATA_DIR="$T/data" APP_DIR="$T/app" KEEP=3 KEEP_ASSETS=2
fail=0; ok(){ echo "PASS $1"; }; bad(){ echo "FAIL $1"; fail=1; }
B="$T/data/backups"

bash "$ROOT/deploy/backup.sh" >/dev/null 2>&1 && ok "a normal run succeeds" || bad "a normal run succeeds"
n=$(ls "$B"/tracker-*.sqlite3.gz | wc -l); [ "$n" = 1 ] && ok "one compressed database backup" || bad "one compressed database backup ($n)"
gunzip -c "$B"/tracker-*.sqlite3.gz > "$T/restored.sqlite3"
c=$("$PYBIN" -c "import sqlite3,sys; print(sqlite3.connect(sys.argv[1]).execute('select count(*) from t').fetchone()[0])" "$T/restored.sqlite3")
[ "$c" = 50 ] && ok "the backup restores with all rows" || bad "the backup restores with all rows ($c)"
[ -f "$B/assets-latest.tar.gz" ] && ls "$B"/assets-2*.tar.gz >/dev/null 2>&1 && ok "receipts: dated archive plus assets-latest" || bad "receipts: dated archive plus assets-latest"
tar -tzf "$B/assets-latest.tar.gz" | grep -q r1.txt && ok "assets-latest contains the receipt" || bad "assets-latest contains the receipt"
ls "$B"/.assets.* "$B"/.assets-latest.tmp >/dev/null 2>&1 && bad "no temporary files left behind" || ok "no temporary files left behind"

# rotation: old database backups beyond KEEP are removed, newest kept; old dated receipt archives beyond KEEP_ASSETS too
for d in 20260101 20260102 20260103; do touch -d "$d" "$B/tracker-$d-000000.sqlite3.gz" "$B/assets-$d.tar.gz"; done
sleep 1; bash "$ROOT/deploy/backup.sh" >/dev/null 2>&1
n=$(ls "$B"/tracker-*.sqlite3.gz | wc -l); [ "$n" = 3 ] && ok "database backups rotate to KEEP" || bad "database backups rotate to KEEP ($n)"
n=$(ls "$B"/assets-2*.tar.gz | wc -l); [ "$n" = 2 ] && ok "dated receipt archives rotate to KEEP_ASSETS" || bad "dated receipt archives rotate to KEEP_ASSETS ($n)"

# a damaged source: the run fails, no new file is kept, and the older backups stay
before=$(ls "$B"/tracker-*.sqlite3.gz | sort | tr '\n' ' ')
head -c 4000 /dev/urandom > "$T/data/tracker.sqlite3"
bash "$ROOT/deploy/backup.sh" >/dev/null 2>&1; rc=$?
after=$(ls "$B"/tracker-*.sqlite3.gz | sort | tr '\n' ' ')
[ "$rc" != 0 ] && ok "a damaged database makes the run fail" || bad "a damaged database makes the run fail"
[ "$before" = "$after" ] && ok "...and older backups are untouched" || bad "...and older backups are untouched"
ls "$B"/*.sqlite3 >/dev/null 2>&1 && bad "...and no half-made file is left" || ok "...and no half-made file is left"
# v45: a missing database is an error and never becomes an empty backup (before, sqlite3.connect created an empty file)
T2=$(mktemp -d); mkdir -p "$T2/data"
DATA_DIR="$T2/data" bash "$ROOT/deploy/backup.sh" >/dev/null 2>&1; rc=$?
[ "$rc" != 0 ] && ok "v45 a missing database makes the run fail" || bad "v45 a missing database makes the run fail"
[ ! -e "$T2/data/tracker.sqlite3" ] && ! ls "$T2/data/backups"/tracker-*.gz >/dev/null 2>&1 && ok "v45 ...no empty database or backup is created" || bad "v45 ...no empty database or backup is created"
# v45: a store with no receipts yet (no dated archive) still finishes
"$PYBIN" -c "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute('create table docs(path text)'); c.commit()" "$T2/data/tracker.sqlite3"
DATA_DIR="$T2/data" bash "$ROOT/deploy/backup.sh" >/dev/null 2>&1 && ok "v45 a run with no receipt archives succeeds" || bad "v45 a run with no receipt archives succeeds"
rm -rf "$T2"
exit $fail
