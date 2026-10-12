"""v42 server checks (review items 29, 31, 32, 35, 37, 38) on a disposable store, with a loopback fake mail server only.
Run from the repository root:  venv/Scripts/python.exe tests/server-hardening.py   (Linux: venv/bin/python)
Never point this at the owner's database: it creates and deletes its own DATA_DIR under the temp folder."""
import base64, datetime as _d, os, shutil, socket, sys, tempfile, threading, zoneinfo

try:  # Windows Python often has no timezone database; Asia/Karachi is a fixed UTC+5
    zoneinfo.ZoneInfo("Asia/Karachi")
except Exception:
    zoneinfo.ZoneInfo = lambda k: _d.timezone(_d.timedelta(hours=5))

DD = os.path.join(tempfile.gettempdir(), "wasooli-server-hardening")
shutil.rmtree(DD, ignore_errors=True)
os.environ.update(DATA_DIR=DD, ADMIN_PASSCODE="test1234", SECRET_KEY="qa-only", COOKIE_SECURE="0", WASOOL_TODAY="2026-10-21")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "server"))
import app as A, db, notify  # noqa: E402

H = {"X-Requested-With": "wasool"}
admin = A.app.test_client()
assert admin.post("/login", data={"passcode": "test1234"}).status_code in (302, 303)
anon = A.app.test_client()
passed = 0


def check(name, cond, extra=""):
    global passed
    if not cond:
        print("FAIL " + name + (" :: " + str(extra) if extra else ""))
        sys.exit(1)
    passed += 1
    print("PASS " + name)


class Fake:
    """A mail server on 127.0.0.1 that advertises AUTH but not STARTTLS, and records what it receives."""
    def __init__(self):
        self.s = socket.socket(); self.s.bind(("127.0.0.1", 0)); self.s.listen(5); self.port = self.s.getsockname()[1]
        self.log = []; threading.Thread(target=self.loop, daemon=True).start()

    def loop(self):
        while True:
            conn, _ = self.s.accept(); threading.Thread(target=self.handle, args=(conn,), daemon=True).start()

    def handle(self, conn):
        f = conn.makefile("rb"); w = lambda x: conn.sendall(x.encode() + b"\r\n")
        w("220 fake ESMTP"); data = False
        for raw in f:
            line = raw.decode(errors="replace").rstrip("\r\n"); self.log.append(line)
            if data:
                if line == ".":
                    data = False; w("250 queued")
                continue
            u = line.upper()
            if u.startswith("EHLO"): conn.sendall(b"250-fake\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n")
            elif u.startswith("AUTH"): w("235 ok")
            elif u.startswith("DATA"): data = True; w("354 go")
            elif u.startswith("QUIT"): w("221 bye"); break
            else: w("250 ok")
        conn.close()

    def creds(self):
        return [base64.b64decode(l.split()[2]).replace(b"\0", b"|").decode(errors="replace") for l in self.log if l.upper().startswith("AUTH PLAIN ")]


fake = Fake()

# ---- 29: an import that would delete records never reports them as "skipped" and then deletes them ----
admin.put("/api/docs/users/a", json={"name": "A"}, headers=H); admin.put("/api/docs/users/b", json={"name": "B"}, headers=H)
r = admin.post("/api/import", json={"docs": {"users/a": {"name": "A2"}, "users/b": None}, "replace": ["users/"]}, headers=H)
check("29 a replace import containing an invalid record is refused (400)", r.status_code == 400 and r.get_json().get("error") == "invalid_docs", r.get_json())
check("29 ...and nothing was changed or deleted", admin.get("/api/docs/users/b", headers=H).status_code == 200 and admin.get("/api/docs/users/a", headers=H).get_json()["data"]["name"] == "A")
r = admin.post("/api/import", json={"docs": {"users/a": {"name": "A3"}, "users/x": None}, "replace": []}, headers=H)
check("29 without a replace, invalid records are still just skipped and reported", r.status_code == 200 and r.get_json()["skipped"] == ["users/x"] and admin.get("/api/docs/users/a", headers=H).get_json()["data"]["name"] == "A3")

# ---- 31: the mail password is never sent when the server does not offer encryption ----
m = {"host": "127.0.0.1", "port": fake.port, "user": "owner@example.com", "password": "dummy-pass", "fromEmail": "owner@example.com"}
fake.log.clear()
try:
    notify.send_mail(m, "x@example.com", "t", "body"); err = ""
except Exception as e:
    err = str(e)
check("31 with a password and no STARTTLS offered, sending is refused", "did not offer encryption" in err, err)
check("31 ...and the password never reached the server", not any("dummy-pass" in x for x in fake.creds()) and not any(l.upper().startswith("AUTH") for l in fake.log), fake.log)
fake.log.clear()
notify.send_mail(dict(m, password=""), "x@example.com", "t", "body")
check("31 without a password (nothing secret to protect) a plain message is still delivered", any(l.upper().startswith("DATA") for l in fake.log), fake.log)

# ---- 32: a changed mail host, port or user never reuses the stored password ----
r1 = admin.put("/api/mail-settings", json={"host": "smtp.example.test", "port": 587, "user": "owner@example.com", "password": "stored-secret-pw", "testTo": "t@example.com"}, headers=H)
check("32 saving mail settings with a password keeps it", r1.get_json()["hasPassword"] is True and "passwordCleared" not in r1.get_json())
r2 = admin.put("/api/mail-settings", json={"host": "smtp.example.test", "port": 587, "user": "owner@example.com", "fromName": "Billing"}, headers=H)
check("32 changing only the display name keeps the saved password", r2.get_json()["hasPassword"] is True and notify.mail_settings()["password"] == "stored-secret-pw")
r3 = admin.put("/api/mail-settings", json={"host": "127.0.0.1", "port": fake.port, "user": "owner@example.com"}, headers=H)
check("32 changing the host without a new password clears the old one and says so", r3.get_json()["hasPassword"] is False and r3.get_json().get("passwordCleared") is True and notify.mail_settings()["password"] == "")
fake.log.clear()
admin.post("/api/mail-test", json={"to": "t@example.com"}, headers=H)
check("32 so a mail test to the new host cannot leak the old password", not any("stored-secret-pw" in x for x in fake.creds()))
r4 = admin.put("/api/mail-settings", json={"host": "smtp2.example.test", "port": 587, "user": "owner@example.com", "password": "new-pw"}, headers=H)
check("32 changing the host together with a new password stores the new one", notify.mail_settings()["password"] == "new-pw" and r4.get_json()["hasPassword"] is True)

# ---- 35: the public health check says only that the app is up and its release ----
hz = anon.get("/healthz").get_json()
check("35 anonymous /healthz shows only ok, app and version", set(hz) == {"ok", "app", "version"} and hz["ok"] is True, hz)
hz2 = admin.get("/healthz").get_json()
check("35 a signed-in admin still sees the details", {"docs_version", "claude", "reading", "linkBase"} <= set(hz2), hz2)
orig = db.version
db.version = lambda: (_ for _ in ()).throw(RuntimeError("secret internal path /var/lib/x"))
bad = anon.get("/healthz"); db.version = orig
check("35 a failing health check never shows the error text", bad.status_code == 500 and "secret" not in bad.get_data(as_text=True), bad.get_data(as_text=True))

# ---- 37: the public choice page limits answers per link and per address ----
tok = "TokFlood" + "A" * 14
admin.put("/api/docs/users/u5", json={"name": "U5", "confirmToken": tok}, headers=H)
admin.put("/api/docs/confirm/" + tok, json={"userId": "u5", "name": "U5", "cycleStart": "2026-10-24", "cycles": {"2026-10-24": {"plans": [], "replyBy": "2026-10-23"}}}, headers=H)
codes = []
for i in range(20):
    codes.append(anon.post("/c/" + tok, data={"choice": "continue" if i % 2 else "discontinue", "note": "n%d" % i}).status_code)
con = db.connect(); rows = con.execute("select count(*) from confirmations where token=?", (tok,)).fetchone()[0]; con.close()
check("37 the first 12 answers in ten minutes are accepted and the rest get 429", codes[:12] == [302] * 12 and codes[12:] == [429] * 8, codes)
check("37 ...and only the accepted ones are stored", rows == 12, rows)
check("37 the refusal is a short plain message, not an error page", "Too many answers" in anon.post("/c/" + tok, data={"choice": "continue"}).get_data(as_text=True))

# ---- 38: a link whose user no longer has that token is not active ----
tok6 = "TokCleared" + "B" * 12
admin.put("/api/docs/users/u6", json={"name": "U6", "confirmToken": ""}, headers=H)
admin.put("/api/docs/confirm/" + tok6, json={"userId": "u6", "name": "U6 Secret", "cycleStart": "2026-10-24", "cycles": {"2026-10-24": {"plans": [], "amountText": "PKR 9,999"}}}, headers=H)
g = anon.get("/c/" + tok6)
check("38 a link of a user whose token was cleared shows the not-active page", g.status_code == 404 and "U6 Secret" not in g.get_data(as_text=True))
tok7 = "TokActive" + "C" * 13
admin.put("/api/docs/users/u7", json={"name": "U7", "confirmToken": tok7}, headers=H)
admin.put("/api/docs/confirm/" + tok7, json={"userId": "u7", "name": "U7 Visible", "cycleStart": "2026-10-24", "cycles": {"2026-10-24": {"plans": [], "amountText": "PKR 1"}}}, headers=H)
check("38 a link whose token matches its user still works", anon.get("/c/" + tok7).status_code == 200)

# ---- v45: same-millisecond saves, receipt caching, audit rows while locked out ----
stamps = [db.set_doc("users/ms", {"n": i}) for i in range(5)]
check("v45 saves of one document in the same millisecond still get strictly later updated_at", all(a < b for a, b in zip(stamps, stamps[1:])), stamps)
os.makedirs(db.ASSETS_DIR, exist_ok=True)
aid = "a" * 32 + ".png"
with open(os.path.join(db.ASSETS_DIR, aid), "wb") as f:
    f.write(b"receipt")
rb = admin.get("/_blob/" + aid)
check("v45 a receipt is served with private caching only", rb.status_code == 200 and "private" in rb.headers.get("Cache-Control", "") and "public" not in rb.headers.get("Cache-Control", ""), dict(rb.headers))
import auth as AU  # noqa: E402
calls = []
real = db.audit
db.audit = lambda *a: calls.append(a)
AU._AUDIT_SEEN.clear()
for _ in range(5):
    AU._audit_once("login.locked", "203.0.113.9")
db.audit = real
check("v45 while an IP stays locked out, one audit row per minute instead of one per request", len(calls) == 1, calls)

print("ALL %d CHECKS PASSED" % passed)
