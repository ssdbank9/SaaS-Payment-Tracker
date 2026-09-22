"""Wasool (Payments Tracker) self-hosted server.

Serves the single-file admin app from the repository root, a JSON document
store behind /api/docs that mirrors the claude.ai artifact ``db`` capability,
receipt uploads, optional Claude screenshot reading, and public one-tap
confirmation pages at /c/<token>.
"""
import json
import os
import re
import secrets
import sys
from datetime import timedelta

from flask import Flask, Response, abort, jsonify, redirect, render_template, request, send_from_directory, session, url_for

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import auth  # noqa: E402
import claude_read  # noqa: E402
import db  # noqa: E402

APP_NAME = "Wasool"
TAGLINE = "Know who's paid."
VERSION = "18"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX_PATH = os.environ.get("INDEX_HTML") or os.path.join(ROOT, "index.html")
TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{16,64}$")
ASSET_RE = re.compile(r"^[A-Za-z0-9_-]{8,40}\.(png|jpg|jpeg|webp|gif)$")
ASSET_EXT = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif"}

app = Flask(__name__, template_folder=os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates"))
_secret = os.environ.get("SECRET_KEY", "")
if not _secret:
    _secret = secrets.token_hex(32)
    print("WARNING: SECRET_KEY is not set; sessions will not survive a restart.", file=sys.stderr)
if not auth.ADMIN_PASSCODE:
    print("WARNING: ADMIN_PASSCODE is not set; nobody can log in.", file=sys.stderr)
app.config.update(
    SECRET_KEY=_secret,
    SESSION_COOKIE_NAME="wasool_session",
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("COOKIE_SECURE", "1") == "1",
    PERMANENT_SESSION_LIFETIME=timedelta(days=60),
    MAX_CONTENT_LENGTH=12 * 1024 * 1024,
    JSON_SORT_KEYS=False,
)

_index_cache = {"mtime": None, "html": ""}


def index_html():
    """The admin app, with a marker that switches the frontend to the api backend."""
    st = os.stat(INDEX_PATH)
    if _index_cache["mtime"] != st.st_mtime:
        with open(INDEX_PATH, encoding="utf-8") as f:
            html = f.read()
        marker = '<meta charset="utf-8">'
        inject = marker + '\n<script>window.__PT_SERVER__={app:%s,version:%s};</script>' % (json.dumps(APP_NAME), json.dumps(VERSION))
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


@app.before_request
def csrf_guard():
    if request.path.startswith("/api/"):
        auth.require_same_origin_header()


# ---------- admin app + auth ----------

@app.get("/")
@auth.login_required
def home():
    return Response(index_html(), mimetype="text/html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if auth.is_logged_in():
        return redirect(url_for("home"))
    error = ""
    if request.method == "POST":
        ok, error = auth.attempt_login(request.form.get("passcode", ""))
        if ok:
            nxt = request.args.get("next") or "/"
            if not nxt.startswith("/") or nxt.startswith("//"):
                nxt = "/"
            return redirect(nxt)
    return render_template("login.html", app_name=APP_NAME, tagline=TAGLINE, error=error, configured=bool(auth.ADMIN_PASSCODE)), (401 if error else 200)


@app.post("/logout")
def logout():
    auth.logout()
    return redirect(url_for("login"))


@app.get("/healthz")
def healthz():
    try:
        v = db.version()
    except Exception as e:  # pragma: no cover
        return jsonify({"ok": False, "app": "wasool", "error": str(e)}), 500
    return jsonify({"ok": True, "app": "wasool", "version": VERSION, "docs_version": v, "claude": claude_read.enabled()})


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
    resp.headers["Content-Disposition"] = "attachment; filename=wasool-export-%s.json" % db.now_iso()[:10]
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


# ---------- Claude reading ----------

@app.get("/api/read-image")
@auth.login_required
def api_read_image_info():
    return jsonify({"enabled": claude_read.enabled(), "model": claude_read.MODEL, "mediaTypes": list(claude_read.MEDIA_TYPES)}), (200 if claude_read.enabled() else 501)


@app.post("/api/read-image")
@auth.login_required
def api_read_image():
    if not claude_read.enabled():
        return jsonify({"error": "not_configured", "message": "Set ANTHROPIC_API_KEY on the server to read screenshots."}), 501
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
        data, text = claude_read.read(prompt, images)
    except claude_read.ReadError as e:
        db.audit("admin", "read.error", e.code, auth.client_ip())
        return jsonify({"error": e.code, "message": e.message, "text": e.text}), e.status
    db.audit("admin", "read.ok", "%d image(s)" % len(images), auth.client_ip())
    return jsonify({"data": data, "text": text})


# ---------- confirmations ----------

@app.get("/api/confirmations")
@auth.login_required
def api_confirmations():
    cycle = request.args.get("cycle", "")
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", cycle):
        return jsonify({"error": "cycle must be YYYY-MM-DD"}), 400
    return jsonify({"cycle": cycle, "answers": db.confirmations_for_cycle(cycle)})


def _confirm_context(token):
    d = db.get_doc("confirm/" + token)
    if not d or not isinstance(d["data"], dict):
        return None
    return d["data"]


@app.route("/c/<token>", methods=["GET", "POST"])
def confirm(token):
    if not TOKEN_RE.match(token):
        abort(404)
    ctx = _confirm_context(token)
    if not ctx:
        return render_template("confirm.html", app_name=APP_NAME, tagline=TAGLINE, missing=True), 404
    cycle = str(ctx.get("cycleStart") or "")
    name = str(ctx.get("name") or "there")
    if request.method == "POST":
        answer = request.form.get("answer", "").lower()
        if answer not in ("yes", "no"):
            abort(400)
        note = (request.form.get("note") or "").strip()
        db.record_confirmation(token, str(ctx.get("userId") or ""), cycle, answer, note, auth.client_ip(), request.headers.get("User-Agent", ""))
        db.audit("public", "confirm." + answer, token[:8] + "… cycle " + cycle, auth.client_ip())
        return redirect(url_for("confirm", token=token, done=1))
    recorded = db.latest_confirmation(token, cycle) if cycle else None
    change = request.args.get("change") == "1"
    return render_template(
        "confirm.html",
        app_name=str(ctx.get("appName") or APP_NAME), tagline=TAGLINE, missing=False,
        name=name, package=ctx.get("package") or "", amount=ctx.get("amount") or "", period=ctx.get("period") or "",
        due_date=ctx.get("dueDate") or "", reply_by=ctx.get("replyBy") or "", cycle=cycle,
        recorded=None if change else recorded, done=request.args.get("done") == "1", token=token,
        nothing_due=bool(ctx.get("nothingDue")),
    )


@app.errorhandler(404)
def not_found(_e):
    if request.path.startswith("/api/"):
        return jsonify({"error": "not_found"}), 404
    return render_template("confirm.html", app_name=APP_NAME, tagline=TAGLINE, missing=True), 404


@app.errorhandler(413)
def too_large(_e):
    return jsonify({"error": "too_large", "message": "Upload is larger than 12 MB."}), 413


if __name__ == "__main__":
    app.run(host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "8080")), debug=False)
