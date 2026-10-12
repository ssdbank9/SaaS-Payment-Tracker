#!/usr/bin/env bash
# v42 check of deploy/update.sh with a local "origin" and stub systemctl/pip (never touches a real service or the VM).
# Run from the repository root:  bash tests/update-script.sh
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
fail=0; ok(){ echo "PASS $1"; }; bad(){ echo "FAIL $1"; fail=1; }
G="git -c user.name=qa -c user.email=qa@example.test"
export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.autocrlf GIT_CONFIG_VALUE_0=false
mkdir -p "$T/bin" "$T/work/server" "$T/work/deploy"; echo "#!/bin/sh" > "$T/work/deploy/x.sh"
cd "$T/work" && git init -q -b main . && echo "libA==1" > server/requirements.txt && echo v1 > code.txt && git add -A && $G commit -qm one
git init -q --bare -b main "$T/origin.git" && git remote add origin "$T/origin.git" && git push -q origin main
git clone -q "$T/origin.git" "$T/app"
mkdir -p "$T/app/venv/bin"
cat > "$T/bin/systemctl" <<EOF
#!/usr/bin/env bash
echo "\$@" >> "$T/systemctl.log"
[ -f "$T/FAIL_RESTART" ] && [ "\$1" = restart ] && exit 1
exit 0
EOF
cat > "$T/app/venv/bin/pip" <<EOF
#!/usr/bin/env bash
echo "pip \$@" >> "$T/pip.log"
[ -f "$T/FAIL_PIP" ] && exit 1
exit 0
EOF
chmod +x "$T/bin/systemctl" "$T/app/venv/bin/pip"
export PATH="$T/bin:$PATH" APP_DIR="$T/app" ENV_FILE="$T/none.env" SERVICE=svc
run(){ bash "$ROOT/deploy/update.sh" >"$T/out.txt" 2>&1; }
pushpush(){ cd "$T/work" && "$@" && git add -A && $G commit -qm "$MSG" && git push -q origin main; cd "$T"; }
head_of(){ git -C "$T/app" rev-parse HEAD; }
restarts(){ grep -c '^restart svc' "$T/systemctl.log" 2>/dev/null; true; }

# 1. nothing new: nothing happens
: > "$T/systemctl.log"; run; [ "$(restarts)" = 0 ] && ok "no change: no restart" || bad "no change: no restart"

# 2. code-only change: pulled, restarted once, no pip, no pending marker
MSG=two pushpush bash -c 'echo v2 > code.txt'
run; [ "$(cat "$T/app/code.txt")" = v2 ] && [ "$(restarts)" = 1 ] && [ ! -e "$T/pip.log" ] && [ ! -e "$T/app/.restart-pending" ] && ok "code-only change is pulled and restarted, pip not run, no marker left" || { bad "code-only change"; cat "$T/out.txt"; }

# 3. requirements change and pip fails: the code stays on the old version, the run fails, no restart
MSG=three pushpush bash -c 'echo "libA==2" > server/requirements.txt; echo v3 > code.txt'
touch "$T/FAIL_PIP"; before=$(head_of); r0=$(restarts)
run; rc=$?
bash "$ROOT/deploy/update.sh" >/dev/null 2>&1; rc=$?
[ "$rc" != 0 ] && ok "failed pip makes the run fail" || bad "failed pip makes the run fail"
[ "$(head_of)" = "$before" ] && [ "$(cat "$T/app/code.txt")" = v2 ] && ok "...the code stays on the old version" || bad "...the code stays on the old version"
[ "$(restarts)" = "$r0" ] && [ ! -e "$T/app/.restart-pending" ] && ok "...no restart and no marker" || bad "...no restart and no marker"

# 4. pip works again: the next run catches up (retry) and restarts
rm -f "$T/FAIL_PIP"; run; rc=$?
[ "$rc" = 0 ] && [ "$(cat "$T/app/code.txt")" = v3 ] && grep -q "pip install" "$T/pip.log" && ok "the next run retries pip and switches to the new code" || bad "the next run retries pip and switches to the new code"
[ "$(restarts)" = "$((r0 + 1))" ] && ok "...and restarts once" || bad "...and restarts once ($(restarts) vs $r0)"

# 5. restart fails after the code switched: run fails, marker stays, the next run restarts even though nothing new was pulled
MSG=four pushpush bash -c 'echo v4 > code.txt'
touch "$T/FAIL_RESTART"; run; rc=$?
[ "$rc" != 0 ] && [ -e "$T/app/.restart-pending" ] && [ "$(cat "$T/app/code.txt")" = v4 ] && ok "failed restart: run fails and the pending marker stays" || bad "failed restart: run fails and the pending marker stays"
rm -f "$T/FAIL_RESTART"; r1=$(restarts); run; rc=$?
[ "$rc" = 0 ] && [ ! -e "$T/app/.restart-pending" ] && [ "$(restarts)" = "$((r1 + 1))" ] && ok "next run finishes the restart and clears the marker" || { bad "next run finishes the restart and clears the marker"; cat "$T/out.txt"; }
exit $fail
