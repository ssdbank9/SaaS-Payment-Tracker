"""Wasooli (Payments Tracker) self-hosted server.

Serves the single-file admin app from the repository root, a JSON document
store behind /api/docs that mirrors the claude.ai artifact ``db`` capability,
receipt uploads, optional Claude screenshot reading, and public one-tap
choice pages at /c/<token> (Continue / Upgrade / Discontinue for the coming cycle).
"""
import hmac
import json
import os
import re
import secrets
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from flask import Flask, Response, abort, jsonify, redirect, render_template, request, send_from_directory, session, url_for
from flask.sessions import SecureCookieSessionInterface
from itsdangerous import URLSafeTimedSerializer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import auth  # noqa: E402
import claude_read  # noqa: E402
import db  # noqa: E402
import gemini_read  # noqa: E402
import notify  # noqa: E402

APP_NAME = "Wasooli"
TAGLINE = "Know who's paid."
VERSION = "30"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX_PATH = os.environ.get("INDEX_HTML") or os.path.join(ROOT, "index.html")
TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{16,64}$")
ASSET_RE = re.compile(r"^[A-Za-z0-9_-]{8,40}\.(png|jpg|jpeg|webp|gif)$")
BRAND_DIR = os.path.join(ROOT, "assets")  # v24: logo, icons and the web-app manifest, committed in the repo
BRAND_FILE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,60}\.(svg|png|webmanifest|ico)$")
APP_TZ = ZoneInfo(os.environ.get("APP_TZ", "Asia/Karachi"))
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ASSET_EXT = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif"}
HOST_RE = re.compile(r"^[a-z0-9.-]+$")


def _host_env(name):
    v = os.environ.get(name, "").strip().lower()
    v = re.sub(r"^https?://", "", v).split("/")[0].split(":")[0]
    return v if HOST_RE.match(v) else ""


DOMAIN = _host_env("DOMAIN")            # the admin address (where the owner signs in)
LINK_DOMAIN = _host_env("LINK_DOMAIN")  # v25: optional separate address for the subscribers' /c/<token> pages
OLD_DOMAIN = _host_env("OLD_DOMAIN")    # v25: a previous admin address, kept as a redirect to DOMAIN
LINK_BASE = ("https://" + LINK_DOMAIN) if LINK_DOMAIN else ""
LINK_HOST_OK = re.compile(r"^/(c/[A-Za-z0-9_-]+/?|assets/[^/]+|healthz|manifest\.webmanifest)$")

app = Flask(__name__, template_folder=os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates"))
_secret = os.environ.get("SECRET_KEY", "")
if not _secret:
    _secret = secrets.token_hex(32)
    print("WARNING: SECRET_KEY is not set; sessions will not survive a restart.", file=sys.stderr)
if not auth.ADMIN_PASSCODE:
    print("WARNING: ADMIN_PASSCODE is not set; nobody can log in.", file=sys.stderr)
app.config.update(
    SECRET_KEY=_secret,
    APP_NAME=APP_NAME,
    SESSION_COOKIE_NAME="wasool_session",
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("COOKIE_SECURE", "1") == "1",
    PERMANENT_SESSION_LIFETIME=timedelta(days=auth.SESSION_DAYS),  # v25: 90 days, renewed on every request (SESSION_REFRESH_EACH_REQUEST)
    MAX_CONTENT_LENGTH=12 * 1024 * 1024,
    JSON_SORT_KEYS=False,
)


class RotatingSessionInterface(SecureCookieSessionInterface):
    """v25: signs the session cookie with a key derived from SECRET_KEY and a version kept in the data
    store, so "Sign out everywhere" can invalidate every session without touching the env file."""

    def get_signing_serializer(self, app):
        key = auth.signing_key(app.config["SECRET_KEY"])
        if not key:
            return None
        return URLSafeTimedSerializer(key, salt=self.salt, serializer=self.serializer,
                                      signer_kwargs={"key_derivation": self.key_derivation, "digest_method": self.digest_method})


app.session_interface = RotatingSessionInterface()
if not auth.admin_path():
    print("WARNING: ADMIN_PATH is not set; the sign-in form stays at /login (visible to anyone). deploy/update.sh adds one on the VM.", file=sys.stderr)

_index_cache = {"mtime": None, "html": ""}


def index_html():
    """The admin app, with a marker that switches the frontend to the api backend."""
    st = os.stat(INDEX_PATH)
    if _index_cache["mtime"] != st.st_mtime:
        with open(INDEX_PATH, encoding="utf-8") as f:
            html = f.read()
        marker = '<meta charset="utf-8">'
        cfg = {"app": APP_NAME, "version": VERSION, "linkBase": LINK_BASE, "sessionDays": auth.SESSION_DAYS}
        inject = marker + '\n<script>window.__PT_SERVER__=%s;</script>' % json.dumps(cfg)
        html = html.replace(marker, inject, 1) if marker in html else inject + html
        _index_cache.update(mtime=st.st_mtime, html=html)
    return _index_cache["html"]


@app.after_request
def headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "same-origin")
    if request.path.startswith("/api/") or request.path == "/":
        resp.headers["Cache-Control"] = "no-store"
    return resp


def request_host():
    return (request.host or "").split(":")[0].lower()


def on_link_host():
    return bool(LINK_DOMAIN) and request_host() == LINK_DOMAIN


def neutral(status=200):
    return auth.neutral_page(APP_NAME, status)


@app.before_request
def host_and_csrf_guard():
    # v25: the link address serves only the subscribers' pages and what they need; nothing admin-shaped exists there
    if on_link_host() and not LINK_HOST_OK.match(request.path):
        return neutral(404)
    # v25: a previous admin address forwards to the current one; the owner's known device lands on the sign-in page
    if OLD_DOMAIN and DOMAIN and request_host() == OLD_DOMAIN:
        target = "https://" + DOMAIN
        if request.path == "/" and auth.known_device(app):
            return redirect(target + auth.login_path())
        if request.path.startswith("/c/"):
            return redirect((LINK_BASE or target) + request.full_path.rstrip("?"), 307 if request.method == "POST" else 302)
        return redirect(target + (request.full_path.rstrip("?") if request.path != "/" else "/"))
    if request.path.startswith("/api/"):
        auth.require_same_origin_header()


# ---------- admin app + auth ----------

@app.get("/")
@auth.login_required
def home():
    resp = Response(index_html(), mimetype="text/html")
    if not auth.known_device(app):  # a session from before v25: mark this browser as the owner's so / keeps finding the sign-in page
        auth.set_device_cookie(app, resp)
    return resp


def _login_view():
    if auth.is_logged_in():
        return redirect(url_for("home"))
    error, status = "", 200
    if request.method == "POST":
        ok, error, status = auth.attempt_login(request.form.get("passcode", ""))
        if ok:
            nxt = request.args.get("next") or "/"
            if not nxt.startswith("/") or nxt.startswith("//"):
                nxt = "/"
            return auth.set_device_cookie(app, redirect(nxt))
    resp = Response(render_template("login.html", app_name=APP_NAME, tagline=TAGLINE, error=error, configured=bool(auth.ADMIN_PASSCODE),
                                    session_days=auth.SESSION_DAYS, action=auth.login_path()), status=status)
    if status == 429:
        resp.headers["Retry-After"] = "60" if "minute." in error else str(auth.LOCK_MINUTES * 60)
    return resp


@app.route("/x/<path_secret>", methods=["GET", "POST"])
def login_hidden(path_secret):
    """v25: the sign-in form lives only here; any other /x/... is the neutral 404."""
    p = auth.admin_path()
    if not p or not hmac.compare_digest(path_secret.encode("utf-8"), p.encode("utf-8")):
        return neutral(404)
    return _login_view()


@app.route("/login", methods=["GET", "POST"])
def login():
    """Kept for servers without ADMIN_PATH (local runs). With one set, this address shows nothing;
    a known device is sent on to the real sign-in page."""
    if not auth.admin_path():
        return _login_view()
    if auth.is_logged_in() or auth.known_device(app):
        return redirect(auth.login_path() if not auth.is_logged_in() else url_for("home"))
    return neutral(200)


@app.post("/logout")
def logout():
    auth.logout()
    return redirect(auth.login_path())


@app.get("/healthz")
def healthz():
    try:
        v = db.version()
    except Exception as e:  # pragma: no cover
        return jsonify({"ok": False, "app": "wasooli", "error": str(e)}), 500
    return jsonify({"ok": True, "app": "wasooli", "version": VERSION, "docs_version": v, "claude": claude_read.enabled(),
                    "reading": reading_provider() if reading_enabled() else "", "linkBase": LINK_BASE})


# ---------- security (v25): the private sign-in address, sign out, sign out everywhere ----------

def sign_in_url():
    p = auth.admin_path()
    if not p:
        return ""
    if DOMAIN:
        return "https://%s/x/%s" % (DOMAIN, p)
    return "%s://%s/x/%s" % ("https" if request.is_secure else "http", request.host, p)  # local runs


def security_payload():
    return {"signInUrl": sign_in_url(), "hasAdminPath": bool(auth.admin_path()), "sessionDays": auth.SESSION_DAYS,
            "linkBase": LINK_BASE, "linkDomain": LINK_DOMAIN, "domain": DOMAIN, "oldDomain": OLD_DOMAIN,
            "secretVersion": auth.secret_version(), "lockout": {"failures": auth.MAX_FAILURES, "minutes": auth.LOCK_MINUTES}}


@app.get("/api/security")
@auth.login_required
def api_security():
    return jsonify(security_payload())


@app.post("/api/security/regenerate-path")
@auth.login_required
def api_security_regenerate():
    p = auth.regenerate_admin_path()
    db.audit("admin", "security.path", "regenerated", auth.client_ip())
    print("security: sign-in address regenerated (…/x/%s…)" % p[:4], file=sys.stderr)
    return jsonify(security_payload())


@app.post("/api/security/signout-all")
@auth.login_required
def api_security_signout_all():
    v = auth.rotate_secret()
    auth.logout()
    db.audit("admin", "security.signout_all", "secret version %d" % v, auth.client_ip())
    resp = jsonify({"ok": True, "secretVersion": v, "signInUrl": sign_in_url(), "loginPath": auth.login_path()})
    return auth.set_device_cookie(app, resp)  # this browser stays a known device; every session is gone


# ---------- brand assets (v24): public, so the phone can fetch the icons and manifest for "Add to home screen" ----------

@app.get("/assets/<name>")
def brand_asset(name):
    if not BRAND_FILE_RE.match(name) or not os.path.isfile(os.path.join(BRAND_DIR, name)):
        abort(404)
    mimetype = "application/manifest+json" if name.endswith(".webmanifest") else None
    return send_from_directory(BRAND_DIR, name, mimetype=mimetype, max_age=86400)


@app.get("/manifest.webmanifest")
def manifest():
    return send_from_directory(BRAND_DIR, "manifest.webmanifest", mimetype="application/manifest+json", max_age=3600)


# ---------- document store ----------

@app.get("/api/version")
@auth.login_required
def api_version():
    return jsonify({"version": db.version()})


@app.get("/api/docs")
@auth.login_required
def api_list_docs():
    prefix = request.args.get("prefix", "")
    if prefix and not db.valid_path(prefix.rstrip("/")):
        return jsonify({"error": "bad_prefix"}), 400
    return jsonify({"docs": db.list_docs(prefix), "version": db.version()})


@app.route("/api/docs/<path:path>", methods=["GET", "PUT", "PATCH", "DELETE"])
@auth.login_required
def api_doc(path):
    if not db.valid_path(path):
        return jsonify({"error": "bad_path"}), 400
    if request.method == "GET":
        d = db.get_doc(path)
        if not d:
            return jsonify({"error": "not_found", "path": path}), 404
        return jsonify(d)
    if request.method == "DELETE":
        db.delete_doc(path)
        db.audit("admin", "doc.delete", path, auth.client_ip())
        return jsonify({"ok": True})
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"error": "body_must_be_object"}), 400
    if request.method == "PUT":
        at = db.set_doc(path, body)
        db.audit("admin", "doc.set", path, auth.client_ip())
        return jsonify({"ok": True, "path": path, "updated_at": at})
    data = db.update_doc(path, body)
    db.audit("admin", "doc.update", path, auth.client_ip())
    return jsonify({"ok": True, "path": path, "data": data})


@app.get("/api/export")
@auth.login_required
def api_export():
    docs = {d["path"]: d["data"] for d in db.list_docs("")}
    out = {"format": "wasool-docs", "version": 1, "exportedAt": db.now_iso(), "docs": docs}
    resp = jsonify(out)
    resp.headers["Content-Disposition"] = "attachment; filename=wasooli-export-%s.json" % db.now_iso()[:10]
    return resp


@app.post("/api/import")
@auth.login_required
def api_import():
    body = request.get_json(silent=True)
    docs = body.get("docs") if isinstance(body, dict) else None
    if not isinstance(docs, dict):
        return jsonify({"error": "expected {docs: {path: data}}"}), 400
    bad = [p for p in docs if not db.valid_path(p) or not isinstance(docs[p], dict)]
    replace = body.get("replace") or []
    if not isinstance(replace, list) or any(not isinstance(r, str) or r not in ("users/", "costs/") for r in replace):
        return jsonify({"error": "replace may only list 'users/' and 'costs/'"}), 400
    n, removed = db.import_docs({p: v for p, v in docs.items() if p not in bad}, replace)
    db.audit("admin", "docs.import", "%d docs, %d removed" % (n, removed), auth.client_ip())
    return jsonify({"ok": True, "imported": n, "removed": removed, "skipped": bad})


# ---------- receipts ----------

@app.post("/api/assets")
@auth.login_required
def api_upload_asset():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "no_file"}), 400
    ext = ASSET_EXT.get((f.mimetype or "").lower())
    if not ext:
        return jsonify({"error": "unsupported_type"}), 415
    asset_id = "%s.%s" % (secrets.token_urlsafe(12), ext)
    f.save(os.path.join(db.ASSETS_DIR, asset_id))
    db.audit("admin", "asset.upload", asset_id, auth.client_ip())
    return jsonify({"id": asset_id, "url": "/_blob/" + asset_id})


@app.get("/_blob/<asset_id>")
@auth.login_required
def blob(asset_id):
    if not ASSET_RE.match(asset_id):
        abort(404)
    return send_from_directory(db.ASSETS_DIR, asset_id, max_age=86400 * 30)


# ---------- screenshot reading (v23: Anthropic or Google Gemini, chosen in Settings → AI reading) ----------

def reading_provider():
    return claude_read.provider()


def reading_enabled(p=None):
    p = p or reading_provider()
    return gemini_read.enabled() if p == "gemini" else claude_read.enabled()


def reading_model(p=None):
    p = p or reading_provider()
    return gemini_read.stored_model() if p == "gemini" else claude_read.MODEL


def not_set_up_message(p=None):
    p = p or reading_provider()
    return gemini_read.not_set_up_message() if p == "gemini" else claude_read.NOT_SET_UP


@app.get("/api/read-image")
@auth.login_required
def api_read_image_info():
    p = reading_provider()
    on = reading_enabled(p)
    return jsonify({"enabled": on, "configured": on, "provider": p, "source": claude_read.key_source() if p == "anthropic" else ("settings" if on else ""),
                    "model": reading_model(p), "mediaTypes": list(claude_read.MEDIA_TYPES),
                    "message": "" if on else not_set_up_message(p)}), (200 if on else 501)


@app.post("/api/read-image")
@auth.login_required
def api_read_image():
    p = reading_provider()
    if not reading_enabled(p):
        return jsonify({"error": "not_configured", "provider": p, "message": not_set_up_message(p)}), 501
    if request.is_json:
        body = request.get_json(silent=True) or {}
        prompt = str(body.get("prompt", ""))
        images = []
    else:
        prompt = request.form.get("prompt", "")
        images = [(f.mimetype or "", f.read()) for f in request.files.getlist("image")]
    if not prompt.strip():
        return jsonify({"error": "no_prompt"}), 400
    try:
        data, text = (gemini_read.read if p == "gemini" else claude_read.read)(prompt, images)
    except claude_read.ReadError as e:
        db.audit("admin", "read.error", "%s: %s" % (p, e.code), auth.client_ip())
        return jsonify({"error": e.code, "message": e.message, "text": e.text, "provider": p}), e.status
    db.audit("admin", "read.ok", "%s: %d image(s)" % (p, len(images)), auth.client_ip())
    return jsonify({"data": data, "text": text, "provider": p, "model": reading_model(p)})


# ---------- AI reading settings (v21: the Anthropic key; v23: provider choice, Gemini key and model; all in the meta table, never in the docs export) ----------

@app.get("/api/ai-settings")
@auth.login_required
def api_ai_settings():
    return jsonify(claude_read.public_ai_settings())


@app.put("/api/ai-settings")
@auth.login_required
def api_ai_settings_put():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"error": "body_must_be_object"}), 400
    cur = claude_read.ai_settings()
    out = dict(cur)
    changes = []
    prov = body.get("provider")
    if prov is not None:
        prov = str(prov).strip().lower()
        if prov not in claude_read.PROVIDERS:
            return jsonify({"error": "bad_provider", "message": "Provider must be anthropic or gemini."}), 400
        if prov != claude_read.provider(cur):
            out["lastTest"] = None
            changes.append("provider " + prov)
        out["provider"] = prov
    if body.get("clearKey"):
        out["apiKey"] = ""
        out["lastTest"] = None
        changes.append("Anthropic key cleared")
    elif body.get("apiKey") is not None:
        key = body.get("apiKey")
        if not isinstance(key, str) or not key.strip():
            return jsonify({"error": "no_key", "message": "Paste the API key first."}), 400
        key = key.strip()
        if len(key) < 20 or len(key) > 400 or re.search(r"\s", key):
            return jsonify({"error": "bad_key", "message": "That does not look like an Anthropic API key (it starts with sk-ant- and has no spaces)."}), 400
        out["apiKey"] = key
        out["lastTest"] = None
        changes.append("Anthropic key saved")
    if body.get("clearGeminiKey"):
        out["geminiKey"] = ""
        out["lastTest"] = None
        changes.append("Gemini key cleared")
    elif body.get("geminiKey") is not None:
        gk = body.get("geminiKey")
        if not isinstance(gk, str) or not gk.strip():
            return jsonify({"error": "no_key", "message": "Paste the Gemini API key first."}), 400
        gk = gk.strip()
        if len(gk) < 20 or len(gk) > 400 or re.search(r"\s", gk):
            return jsonify({"error": "bad_key", "message": "That does not look like a Gemini API key (it starts with AIza and has no spaces)."}), 400
        out["geminiKey"] = gk
        out["lastTest"] = None
        changes.append("Gemini key saved")
    if body.get("geminiModel") is not None:
        gm = gemini_read.norm_model(body.get("geminiModel"))
        if str(body.get("geminiModel") or "").strip() and not gm:
            return jsonify({"error": "bad_model", "message": "A Gemini model id has only letters, digits, dots and dashes (e.g. gemini-2.5-flash-lite)."}), 400
        if gm != gemini_read.stored_model(cur):
            out["lastTest"] = None
            changes.append("Gemini model " + (gm or "cleared"))
        out["geminiModel"] = gm
    if not changes:
        return jsonify({"error": "nothing_to_save", "message": "Nothing to save."}), 400
    out["savedAt"] = db.now_iso()
    db.set_meta("ai", out)
    db.audit("admin", "ai.settings", "; ".join(changes), auth.client_ip())
    return jsonify(claude_read.public_ai_settings(out))


@app.post("/api/ai-models")
@auth.login_required
def api_ai_models():
    """v23: the Gemini models this key can use (generateContent, picture-capable), flash-lite first, and the preselected default.
    Body may carry a typed geminiKey not saved yet; otherwise the stored key is used."""
    body = request.get_json(silent=True) or {}
    key = str(body.get("geminiKey") or "").strip() or gemini_read.stored_key()
    if not key:
        return jsonify({"error": "not_configured", "message": "Paste a Gemini API key first."}), 400
    try:
        models = gemini_read.list_models(key)
    except claude_read.ReadError as e:
        db.audit("admin", "ai.models.error", e.code, auth.client_ip())
        return jsonify({"error": e.code, "message": e.message}), e.status
    return jsonify({"models": models, "default": gemini_read.pick_default(models), "current": gemini_read.stored_model()})


@app.post("/api/ai-test")
@auth.login_required
def api_ai_test():
    """Validate the selected provider with one tiny request; report the API's error message as-is."""
    body = request.get_json(silent=True) or {}
    p = str(body.get("provider") or "").strip().lower()
    if p not in claude_read.PROVIDERS:
        p = claude_read.provider()
    if p == "gemini":
        typed = str(body.get("geminiKey") or "").strip()
        key = typed or gemini_read.stored_key()
        model = gemini_read.norm_model(body.get("model")) or gemini_read.stored_model()
        stored = (not typed or typed == gemini_read.stored_key()) and model == gemini_read.stored_model() and p == claude_read.provider()
    else:
        typed = str(body.get("apiKey") or "").strip()
        key = typed or claude_read.api_key()
        model = claude_read.MODEL
        stored = (not typed or typed == claude_read.stored_key()) and p == claude_read.provider()
    if not key:
        return jsonify({"error": "not_configured", "provider": p, "message": "No API key yet: paste one above and save it."}), 400
    result = {"ok": True, "at": db.now_iso(), "provider": p}
    try:
        result["model"] = gemini_read.test_key(key, model) if p == "gemini" else claude_read.test_key(key)
    except claude_read.ReadError as e:
        result.update(ok=False, error=e.code, message=e.message)
        if stored:
            m = claude_read.ai_settings()
            m["lastTest"] = result
            db.set_meta("ai", m)
        db.audit("admin", "ai.test.error", "%s: %s" % (p, e.code), auth.client_ip())
        return jsonify({"error": e.code, "message": e.message, "provider": p, "lastTest": result}), e.status
    if stored:
        m = claude_read.ai_settings()
        m["lastTest"] = result
        db.set_meta("ai", m)
    db.audit("admin", "ai.test", "%s: %s" % (p, result["model"]), auth.client_ip())
    return jsonify({"ok": True, "provider": p, "model": result["model"], "at": result["at"], "lastTest": result})


# ---------- confirmations (answers from the public choice pages) ----------

@app.get("/api/confirmations")
@auth.login_required
def api_confirmations():
    cycle = request.args.get("cycle", "")
    if not DATE_RE.match(cycle):
        return jsonify({"error": "cycle must be YYYY-MM-DD"}), 400
    return jsonify({"cycle": cycle, "answers": db.confirmations_for_cycle(cycle)})


@app.post("/api/confirmations/<int:conf_id>/applied")
@auth.login_required
def api_confirmation_applied(conf_id):
    at = db.mark_applied(conf_id)
    if not at:
        return jsonify({"error": "not_found"}), 404
    return jsonify({"ok": True, "id": conf_id, "applied_at": at})


# ---------- mail settings (kept in the meta table, never in the docs export) ----------

@app.get("/api/mail-settings")
@auth.login_required
def api_mail_settings():
    return jsonify(notify.public_mail_settings())


@app.put("/api/mail-settings")
@auth.login_required
def api_mail_settings_put():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"error": "body_must_be_object"}), 400
    cur = notify.mail_settings()
    out = {}
    for k in ("host", "user", "fromName", "fromEmail", "testTo"):
        out[k] = str(body.get(k, cur.get(k, "")) or "").strip()[:200]
    try:
        port = int(body.get("port") or cur.get("port") or 587)
    except (TypeError, ValueError):
        return jsonify({"error": "bad_port"}), 400
    out["port"] = port if 1 <= port <= 65535 else 587
    pw = body.get("password")
    if body.get("clearPassword"):
        out["password"] = ""
    elif isinstance(pw, str) and pw:
        out["password"] = pw[:500]
    else:
        out["password"] = cur.get("password", "")
    db.set_meta("mail", out)
    db.audit("admin", "mail.settings", out["host"], auth.client_ip())
    return jsonify(notify.public_mail_settings(out))


@app.post("/api/mail-test")
@auth.login_required
def api_mail_test():
    m = notify.mail_settings()
    body = request.get_json(silent=True) or {}
    to = str(body.get("to") or m.get("testTo") or "").strip()
    if not notify.mail_configured(m):
        return jsonify({"error": "not_configured", "message": "Fill in the SMTP host, user and app password first."}), 400
    if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", to):
        return jsonify({"error": "no_recipient", "message": "Enter the address to send the test to."}), 400
    settings = ((db.get_doc("settings/main") or {}).get("data") or {})
    name = (settings.get("appName") or "").strip() or APP_NAME
    try:
        notify.send_mail(m, to, "%s: test email" % name, "This is a test from %s. If you can read this, the daily reminder emails will work.\n\nSent %s." % (name, db.now_iso()))
    except Exception as e:  # noqa: BLE001 - report the SMTP error to the admin
        db.audit("admin", "mail.test.error", str(e)[:200], auth.client_ip())
        return jsonify({"error": "smtp_failed", "message": str(e)[:300]}), 502
    db.audit("admin", "mail.test", to, auth.client_ip())
    return jsonify({"ok": True, "to": to})


# ---------- public choice page ----------

def _confirm_context(token):
    d = db.get_doc("confirm/" + token)
    if not d or not isinstance(d["data"], dict):
        return None
    ctx = d["data"]
    uid = str(ctx.get("userId") or "")
    if uid:
        # the link must still be the user's current one; a replaced token shows "not active"
        u = db.get_doc("users/" + uid)
        if not u or not isinstance(u["data"], dict) or (u["data"].get("confirmToken") and u["data"].get("confirmToken") != token):
            return None
    return ctx


def _today():
    t = os.environ.get("WASOOL_TODAY", "")
    return t if DATE_RE.match(t) else datetime.now(APP_TZ).date().isoformat()


def _card(ctx, cycle):
    cycles = ctx.get("cycles") if isinstance(ctx.get("cycles"), dict) else {}
    card = cycles.get(cycle)
    if not isinstance(card, dict) and isinstance(ctx.get("plans"), list) and ctx.get("cycleStart") == cycle:
        card = ctx
    return card if isinstance(card, dict) else None


def _plans(card, packages):
    """Plan boxes for the page; the admin page writes them, the package list from settings labels the switch button."""
    out = []
    by_id = {p.get("id"): p for p in packages if isinstance(p, dict)}
    for p in card.get("plans") or []:
        if not isinstance(p, dict):
            continue
        sw = p.get("switch") if isinstance(p.get("switch"), dict) else None
        if sw:
            tgt = by_id.get(sw.get("packageId")) or {}
            sw = dict(sw, name=sw.get("name") or tgt.get("name") or "another tier")
            if not sw.get("label"):
                cur = str(p.get("tier") or "")
                sw["label"] = ("Move back to %s" % sw["name"]) if re.search(r"max", cur, re.I) else ("Upgrade to %s" % sw["name"]) if re.search(r"max", sw["name"], re.I) else ("Change to %s" % sw["name"])
        out.append({"planId": str(p.get("planId") or ""), "label": p.get("label") or p.get("tier") or "Plan", "acct": p.get("acct") or "", "tier": p.get("tier") or "",
                    "amountText": p.get("amountText") or "", "paid": bool(p.get("paid")), "priceText": p.get("priceText") or "", "switch": sw,
                    # v30: a cycle billed as another package by hand has no switch; the admin page sends the reason instead
                    "switchNote": str(p.get("switchNote") or "")[:120]})
    return out


@app.route("/c/<token>", methods=["GET", "POST"])
def confirm(token):
    if not TOKEN_RE.match(token):
        abort(404)
    if LINK_DOMAIN and not on_link_host():  # v25: the subscribers' pages live on the link address only
        return redirect(LINK_BASE + request.full_path.rstrip("?"), 307 if request.method == "POST" else 302)
    ctx = _confirm_context(token)
    if not ctx:
        return render_template("confirm.html", app_name=APP_NAME, tagline=TAGLINE, missing=True), 404
    settings = ((db.get_doc("settings/main") or {}).get("data") or {})
    packages = settings.get("packages") if isinstance(settings.get("packages"), list) else []
    app_name = str(ctx.get("appName") or (settings.get("appName") or "").strip() or APP_NAME)
    cycle = str(ctx.get("cycleStart") or "")
    name = str(ctx.get("name") or "there")
    card = _card(ctx, cycle) or {}
    plans = _plans(card, packages)
    multi = len(plans) > 1 and bool(card.get("multi", True))
    today = _today()
    reply_by = str(card.get("replyBy") or ctx.get("replyByISO") or "")
    open_now = bool(cycle) and (not DATE_RE.match(reply_by) or today <= reply_by)
    if request.method == "POST":
        if not open_now:
            abort(403)
        choice = db.norm_choice(request.form.get("choice") or request.form.get("answer") or "")
        if choice not in db.CHOICES:
            abort(400)
        plan_id = (request.form.get("planId") or "").strip()[:80]
        plan = next((p for p in plans if p["planId"] == plan_id), None) if plan_id else None
        if plan_id and not plan:
            abort(400)
        target = ""
        if choice in ("upgrade", "downgrade"):
            sw = (plan or (plans[0] if plans else {})).get("switch") if (plan or plans) else None
            if not sw:
                abort(400)
            target = str(sw.get("packageId") or "")
            choice = sw.get("choice") if sw.get("choice") in ("upgrade", "downgrade") else choice
        if not multi:
            plan_id = ""  # one answer covers every monthly plan
        note = (request.form.get("note") or "").strip()
        db.record_confirmation(token, str(ctx.get("userId") or ""), cycle, choice, note, auth.client_ip(), request.headers.get("User-Agent", ""), plan_id, target)
        db.audit("public", "choice." + choice, token[:8] + "… cycle " + cycle + (" plan " + plan_id if plan_id else ""), auth.client_ip())
        return redirect(url_for("confirm", token=token, done=1))
    answers = db.latest_confirmations(token, cycle) if cycle else {}
    if not multi and answers and "" not in answers:
        answers = {"": sorted(answers.values(), key=lambda a: a["id"])[-1]}
    change = request.args.get("change") == "1"
    for p in plans:
        a = answers.get(p["planId"] if multi else "")
        p["answer"] = None if change else a
    whole = None if (multi or change) else answers.get("")
    return render_template(
        "confirm.html",
        app_name=app_name, tagline=TAGLINE, missing=False, token=token, name=name, cycle=cycle,
        period=card.get("periodText") or ctx.get("period") or "", due_date=card.get("dueDateText") or ctx.get("dueDate") or "",
        reply_by=card.get("replyByText") or ctx.get("replyBy") or "", amount=card.get("amountText") or ctx.get("amount") or "",
        plans=plans, multi=multi, whole=whole, answered=bool(whole) or (multi and all(p.get("answer") for p in plans)),
        done=request.args.get("done") == "1", open_now=open_now, nothing_due=not plans and bool(ctx.get("nothingDue")),
        pay_how=(settings.get("payHow") or "").strip() or notify.DEFAULT_PAY_HOW, owner=(settings.get("ownerName") or "").strip(),
        labels={"continue": "Continue", "discontinue": "Discontinue"},
    )


@app.errorhandler(404)
def not_found(_e):
    if request.path.startswith("/api/"):
        return jsonify({"error": "not_found"}), 404
    if request.path.startswith("/c/"):
        return render_template("confirm.html", app_name=APP_NAME, tagline=TAGLINE, missing=True), 404
    return neutral(404)  # v25: no hint of anything else living here


@app.errorhandler(413)
def too_large(_e):
    return jsonify({"error": "too_large", "message": "Upload is larger than 12 MB."}), 413


if __name__ == "__main__":
    app.run(host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "8080")), debug=False)
