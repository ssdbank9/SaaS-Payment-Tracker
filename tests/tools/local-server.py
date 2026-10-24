"""Disposable local Wasooli server for the browser suites (test passcode test1234). Never point it at the owner's data.
Run from the repository root:
  venv/Scripts/python.exe tests/tools/local-server.py <empty-data-dir> <port>     (Linux/macOS: venv/bin/python)
WASOOL_TODAY pins the server's date (default 2026-10-20, the date most suites assume)."""
import datetime, os, sys, zoneinfo

try:  # Windows Python often has no timezone database; Asia/Karachi is a fixed UTC+5
    zoneinfo.ZoneInfo("Asia/Karachi")
except Exception:
    zoneinfo.ZoneInfo = lambda k: datetime.timezone(datetime.timedelta(hours=5))

os.environ.update(DATA_DIR=sys.argv[1], ADMIN_PASSCODE="test1234", SECRET_KEY="qa-only", COOKIE_SECURE="0",
                  WASOOL_TODAY=os.environ.get("WASOOL_TODAY", "2026-10-20"))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "server"))
import app  # noqa: E402

app.app.run(host="127.0.0.1", port=int(sys.argv[2]), threaded=True)
