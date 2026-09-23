"""Single-admin passcode login with a signed session cookie.

v25: the failure counter is keyed by the visitor's real IP (Caddy's X-Forwarded-For, only trusted
from localhost) so a stranger cannot lock the owner out; a gentle global brake stops a flood; the
login form lives at a hidden address (/x/<ADMIN_PATH>); a signed "known device" cookie lets the
owner's own browsers find it from /; sessions last SESSION_DAYS (90) with sliding renewal; and
"Sign out everywhere" rotates the session signing key through a version kept in the data store.
"""
import hashlib
import hmac
import os
import secrets
import sys
import time
from functools import wraps

from flask import abort, jsonify, redirect, render_template, request, session, url_for
from itsdangerous import BadSignature, URLSafeTimedSerializer

import db

ADMIN_PASSCODE = os.environ.get("ADMIN_PASSCODE", "")
MAX_FAILURES = 8          # per IP per LOCK_MINUTES
LOCK_MINUTES = 15
GLOBAL_PER_MINUTE = int(os.environ.get("LOGIN_GLOBAL_PER_MINUTE", "60") or 60)  # all IPs together -> 429
SESSION_DAYS = max(1, int(os.environ.get("SESSION_DAYS", "90") or 90))
DEVICE_COOKIE = "wasool_device"
DEVICE_DAYS = 365
LOOPBACK = ("127.0.0.1", "::1", "::ffff:127.0.0.1")
_ADMIN_PATH_ENV = os.environ.get("ADMIN_PATH", "").strip()
_admin_path_cache = {"at": 0.0, "value": None}


def _ok_path(p):
    return isinstance(p, str) and 16 <= len(p) <= 80 and all(c.isalnum() or c in "-_" for c in p)


def admin_path():
    """The secret part of the sign-in address. A value regenerated from Settings (kept in the meta
    table) wins over ADMIN_PATH in the env file; empty means the old /login address (local runs)."""
    now = time.time()
    if _admin_path_cache["value"] is None or now - _admin_path_cache["at"] > 2:
        try:
            stored = db.get_meta("admin_path", "")
        except Exception:  # pragma: no cover - the store is created lazily on first use
            stored = ""
        _admin_path_cache.update(at=now, value=stored if _ok_path(stored) else (_ADMIN_PATH_ENV if _ok_path(_ADMIN_PATH_ENV) else ""))
    return _admin_path_cache["value"]


def regenerate_admin_path():
    p = secrets.token_urlsafe(18)  # 24 url-safe chars
    db.set_meta("admin_path", p)
    _admin_path_cache.update(at=0.0, value=None)
    return p


def login_path():
    p = admin_path()
    return "/x/" + p if p else "/login"


def client_ip():
    """gunicorn binds to localhost, so a request from loopback came through Caddy, which sets
    X-Forwarded-For (by default replacing anything the client sent; if it ever appends, the address
    it appended is the last one). From anywhere else the header is untrusted."""
    remote = (request.remote_addr or "")[:64]
    if remote in LOOPBACK:
        xff = [a.strip() for a in request.headers.get("X-Forwarded-For", "").split(",") if a.strip()]
        if xff:
            return xff[-1][:64]
    return remote


def is_logged_in():
    return bool(session.get("admin")) and bool(ADMIN_PASSCODE)


def check_passcode(candidate):
    if not ADMIN_PASSCODE:
        return False
    return hmac.compare_digest(candidate.encode("utf-8"), ADMIN_PASSCODE.encode("utf-8"))


def locked_out(ip):
    return db.failed_logins(ip, LOCK_MINUTES) >= MAX_FAILURES


def global_brake():
    """True when every IP together tried more than GLOBAL_PER_MINUTE times in the last minute."""
    return GLOBAL_PER_MINUTE > 0 and db.login_attempts_since(60) >= GLOBAL_PER_MINUTE


def attempt_login(candidate):
    """Returns (ok, message, status).  Locks the visitor's IP after MAX_FAILURES failures in LOCK_MINUTES
    (that IP only), answers 429 while the global brake is on, and adds a small delay on failure."""
    ip = client_ip()
    if global_brake():
        db.audit("anon", "login.brake", "", ip)
        print("login: global brake, %d+ attempts/min (last from %s)" % (GLOBAL_PER_MINUTE, ip), file=sys.stderr)
        return False, "Too many sign-in attempts right now. Try again in a minute.", 429
    if locked_out(ip):
        db.audit("anon", "login.locked", "", ip)
        print("login: %s is locked out (%d failures in %d min)" % (ip, MAX_FAILURES, LOCK_MINUTES), file=sys.stderr)
        return False, "Too many attempts from this device. Try again in %d minutes." % LOCK_MINUTES, 429
    ok = check_passcode(candidate or "")
    db.record_login(ip, ok)
    if ok:
        session.clear()
        session.permanent = True
        session["admin"] = True
        session["at"] = int(time.time())
        db.audit("admin", "login.ok", "", ip)
        return True, "", 200
    db.audit("anon", "login.fail", "", ip)
    if db.failed_logins(ip, LOCK_MINUTES) >= MAX_FAILURES:
        print("login: locking %s for %d minutes after %d failures" % (ip, LOCK_MINUTES, MAX_FAILURES), file=sys.stderr)
    time.sleep(0.8)
    return False, "That passcode is not right.", 401


def logout():
    session.clear()


# ---------- session signing key (rotated by "Sign out everywhere") ----------

def secret_version():
    try:
        return int(db.get_meta("secret_version", 0) or 0)
    except (TypeError, ValueError):
        return 0


def signing_key(base):
    """Version 0 is the raw SECRET_KEY, so sessions issued before v25 stay valid; every rotation derives a new key."""
    v = secret_version()
    if not base or v <= 0:
        return base
    return hashlib.sha256(("%s:rotate:%d" % (base, v)).encode("utf-8")).hexdigest()


def rotate_secret():
    v = secret_version() + 1
    db.set_meta("secret_version", v)
    return v


# ---------- known-device cookie ----------

def _device_serializer(app):
    return URLSafeTimedSerializer(app.config["SECRET_KEY"], salt="wasool-known-device")


def set_device_cookie(app, resp):
    """Marks this browser as one the owner has signed in from. Holds nothing that helps to log in;
    it only makes / redirect to the sign-in page instead of the neutral page."""
    val = _device_serializer(app).dumps({"d": 1, "at": int(time.time())})
    resp.set_cookie(DEVICE_COOKIE, val, max_age=DEVICE_DAYS * 86400, httponly=True, samesite="Lax",
                    secure=app.config.get("SESSION_COOKIE_SECURE", True), path="/")
    return resp


def known_device(app):
    val = request.cookies.get(DEVICE_COOKIE, "")
    if not val:
        return False
    try:
        _device_serializer(app).loads(val, max_age=DEVICE_DAYS * 86400)
        return True
    except BadSignature:
        return False


def clear_device_cookie(resp):
    resp.delete_cookie(DEVICE_COOKIE, path="/")
    return resp


# ---------- decorators ----------

def neutral_page(app_name, status=200):
    """What a stranger sees: the mark and one line. No hint that anything else exists."""
    return render_template("neutral.html", app_name=app_name, tagline=""), status


def login_required(view):
    """HTML routes: a known device is sent to the sign-in page, anyone else gets the neutral page.
    API routes (path starts with /api or /_blob): 401 JSON."""
    @wraps(view)
    def wrapped(*args, **kwargs):
        if is_logged_in():
            return view(*args, **kwargs)
        if request.path.startswith("/api/") or request.path.startswith("/_blob/"):
            return jsonify({"error": "unauthorized"}), 401
        from flask import current_app
        if known_device(current_app) or not admin_path():
            nxt = request.path if request.path != "/" else None
            return redirect(login_path() + (("?next=" + nxt) if nxt else ""))
        return neutral_page(current_app.config.get("APP_NAME", "Wasooli"))
    return wrapped


def require_same_origin_header():
    """CSRF guard for state-changing API calls: fetch() from the page sets X-Requested-With."""
    if request.method in ("POST", "PUT", "PATCH", "DELETE") and request.headers.get("X-Requested-With") != "wasool":
        abort(403)
