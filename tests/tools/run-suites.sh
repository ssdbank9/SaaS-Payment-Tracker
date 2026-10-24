#!/usr/bin/env bash
# Runs browser suites one at a time, each on its own fresh disposable local server (never the owner's data).
# Run them one at a time: parallel runs on the Windows PC caused ERR_NO_BUFFER_SPACE and false failures.
#
#   export PLAYWRIGHT_MODULE=<path to node_modules/playwright>     # if `require('playwright')` does not resolve
#   export PLAYWRIGHT_EXECUTABLE=<path to chrome/msedge>           # if Playwright's own browser is not installed
#   bash tests/tools/run-suites.sh all                              # every suite, then the server/deploy checks
#   bash tests/tools/run-suites.sh payment-flow own-start-flow      # chosen suites (names without .cjs)
#
# Results: one line per suite ("name rc=0 pass=N"); logs and screenshots under $WASOOLI_RUNS (default: a temp folder).
# statement-import-flow runs on tests/fake-reader-server.py (only the Claude API call is replaced);
# browser-save-failure-flow needs no server; cancellation-flow prints "record" lines instead of PASS (rc=0 is the result).
set -u
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PY="$ROOT/venv/Scripts/python.exe"; [ -x "$PY" ] || PY="$ROOT/venv/bin/python"
RUNS=${WASOOLI_RUNS:-$(mktemp -d 2>/dev/null || echo "${TMPDIR:-/tmp}/wasooli-runs")}
PORT=${WASOOLI_PORT_BASE:-8140}
winpath(){ if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else echo "$1"; fi; }
suites=("$@")
if [ "${1:-}" = all ] || [ $# -eq 0 ]; then
  suites=(); for f in "$ROOT"/tests/*-flow.cjs; do n=$(basename "$f" .cjs); [ "$n" = browser-save-failure-flow ] || suites+=("$n"); done
  suites+=(browser-save-failure-flow server-hardening backup-script update-script)
fi
echo "runs: $RUNS"
for t in "${suites[@]}"; do
  d="$RUNS/$t"; rm -rf "$d"; mkdir -p "$d/store"
  case "$t" in
    server-hardening) (cd "$ROOT" && "$PY" tests/server-hardening.py > "$d/test.log" 2>&1); echo "$t rc=$? pass=$(grep -c '^PASS' "$d/test.log")"; continue;;
    backup-script) (cd "$ROOT" && PYBIN="$PY" bash tests/backup-script.sh > "$d/test.log" 2>&1); echo "$t rc=$? pass=$(grep -c '^PASS' "$d/test.log")"; continue;;
    update-script) (cd "$ROOT" && bash tests/update-script.sh > "$d/test.log" 2>&1); echo "$t rc=$? pass=$(grep -c '^PASS' "$d/test.log")"; continue;;
    browser-save-failure-flow) (cd "$ROOT" && WASOOLI_TEST_OUTPUT="$(winpath "$d/out")" node tests/$t.cjs > "$d/test.log" 2>&1); echo "$t rc=$? pass=$(grep -c '^PASS' "$d/test.log")"; continue;;
  esac
  PORT=$((PORT+1))
  srv="$ROOT/tests/tools/local-server.py"; [ "$t" = statement-import-flow ] && srv="$ROOT/tests/fake-reader-server.py"
  "$PY" "$srv" "$(winpath "$d/store")" "$PORT" > "$d/server.log" 2>&1 & pid=$!
  for i in $(seq 1 30); do curl -s "127.0.0.1:$PORT/healthz" >/dev/null && break; sleep 1; done
  node "$ROOT/tests/tools/warm.cjs" "http://127.0.0.1:$PORT" >> "$d/server.log" 2>&1
  (cd "$ROOT" && WASOOLI_TEST_URL="http://127.0.0.1:$PORT" WASOOLI_TEST_OUTPUT="$(winpath "$d/out")" timeout 600 node "tests/$t.cjs" > "$d/test.log" 2>&1); rc=$?
  kill "$pid" 2>/dev/null; [ -r "/proc/$pid/winpid" ] && taskkill //F //PID "$(cat /proc/$pid/winpid)" >/dev/null 2>&1
  echo "$t rc=$rc pass=$(grep -c '^PASS' "$d/test.log")"
done
