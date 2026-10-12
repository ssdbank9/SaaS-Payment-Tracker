"""v44 test server: the real app on a disposable store, with only the call to the Claude API replaced by a fixed statement reply.
Used by tests/statement-import-flow.cjs to check the whole screenshot path (upload -> /api/read-image -> review rows -> duplicate flag -> costs)
without an API key. It refuses to answer unless a real image and the statement prompt arrive, the same input the real reader gets.
Run from the repository root:  venv/Scripts/python.exe tests/fake-reader-server.py <empty-data-dir> <port>   (Linux: venv/bin/python)
Never point it at the owner's data directory."""
import datetime, os, sys, zoneinfo

try:  # Windows Python often has no timezone database; Asia/Karachi is a fixed UTC+5
    zoneinfo.ZoneInfo("Asia/Karachi")
except Exception:
    zoneinfo.ZoneInfo = lambda k: datetime.timezone(datetime.timedelta(hours=5))

os.environ.update(DATA_DIR=sys.argv[1], ADMIN_PASSCODE="test1234", SECRET_KEY="qa-only", COOKIE_SECURE="0", WASOOL_TODAY=os.environ.get("WASOOL_TODAY", "2026-10-20"))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "server"))
import app as A, claude_read  # noqa: E402

STATEMENT = [
    {"date": "2026-09-25", "description": "OPENAI *CHATGPT SUBSCR", "amount": 5150, "currency": "PKR", "is_credit": False},
    {"date": "2026-09-26", "description": "FED EXCISE DUTY", "amount": 823.5, "currency": "PKR", "is_credit": False},
    {"date": "2026-09-28", "description": "PAYMENT RECEIVED - THANK YOU", "amount": 20000, "currency": "PKR", "is_credit": True},
]


def fake_read(prompt, images=()):
    images = list(images)
    if not images or not all(mt in claude_read.MEDIA_TYPES and len(b) > 0 for mt, b in images):
        raise claude_read.ReadError("image_rejected", "fake reader: no usable image arrived", 415)
    if "credit-card statement" not in prompt:
        raise claude_read.ReadError("api_error", "fake reader: the statement prompt did not arrive", 502)
    return STATEMENT, "fake reply"


claude_read.enabled = lambda: True
claude_read.read = fake_read
A.app.run(host="127.0.0.1", port=int(sys.argv[2]), threaded=True)
