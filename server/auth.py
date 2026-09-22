"""Single-admin passcode login with a signed session cookie."""
import hmac
import os
import time
from functools import wraps

from flask import abort, jsonify, redirect, request, session, url_for

import db

ADMIN_PASSCODE = os.environ.get("ADMIN_PASSCODE", "")
MAX_FAILURES = 8          # per IP per 15 minutes
LOCK_MINUTES = 15


def client_ip():
    # Caddy sets X-Forwarded-For; gunicorn binds to localhost so trust the first hop.
    xff = request.headers.get("X-Forwarded-For", "")
    if xff:
        return xff.split(",")[0].strip()[:64]
    return (request.remote_addr or "")[:64]


def is_logged_in():
    return bool(session.get("admin")) and bool(ADMIN_PASSCODE)


def check_passcode(candidate):
    if not ADMIN_PASSCODE:
        return False
    return hmac.compare_digest(candidate.encode("utf-8"), ADMIN_PASSCODE.encode("utf-8"))


def locked_out(ip):
    return db.failed_logins(ip, LOCK_MINUTES) >= MAX_FAILURES


def attempt_login(candidate):
    """Returns (ok, message).  Rate-limits by IP and adds a small delay on failure."""
    ip = client_ip()
    if locked_out(ip):
        db.audit("anon", "login.locked", "", ip)
        return False, "Too many attempts. Try again in %d minutes." % LOCK_MINUTES
    ok = check_passcode(candidate or "")
    db.record_login(ip, ok)
    if ok:
        session.clear()
        session.permanent = True
        session["admin"] = True
        session["at"] = int(time.time())
        db.audit("admin", "login.ok", "", ip)
        return True, ""
    db.audit("anon", "login.fail", "", ip)
    time.sleep(0.8)
    return False, "That passcode is not right."


def logout():
    session.clear()


def login_required(view):
    """HTML routes: redirect to /login.  API routes (path starts with /api or /_blob): 401 JSON."""
    @wraps(view)
    def wrapped(*args, **kwargs):
        if is_logged_in():
            return view(*args, **kwargs)
        if request.path.startswith("/api/") or request.path.startswith("/_blob/"):
            return jsonify({"error": "unauthorized"}), 401
        return redirect(url_for("login", next=request.path if request.path != "/" else None))
    return wrapped


def require_same_origin_header():
    """CSRF guard for state-changing API calls: fetch() from the page sets X-Requested-With."""
    if request.method in ("POST", "PUT", "PATCH", "DELETE") and request.headers.get("X-Requested-With") != "wasool":
        abort(403)
