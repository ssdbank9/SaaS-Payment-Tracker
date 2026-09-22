"""Wasool (Payments Tracker) self-hosted server.

Serves the single-file admin app from the repository root, a JSON document
store behind /api/docs that mirrors the claude.ai artifact ``db`` capability,
receipt uploads, optional Claude screenshot reading, and public one-tap
choice pages at /c/<token> (Continue / Upgrade / Discontinue for the coming cycle).
"""
import json
import os
import re
import secrets
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from flask import Flask, Response, abort, jsonify, redirect, render_template, request, send_from_directory, session, url_for

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import auth  # noqa: E402
import claude_read  # noqa: E402
import db  # noqa: E402
import notify  # noqa: E402

APP_NAME = "Wasool"
TAGLINE = "Know who's paid."
VERSION = "21"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX_PATH = os.environ.get("INDEX_HTML") or os.path.join(ROOT, "index.html")
TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{16,64}$")
ASSET_RE = re.compile(r"^[A-Za-z0-9_-]{8,40}\.(png|jpg|jpeg|webp|gif)$")
APP_TZ = ZoneInfo(os.environ.get("APP_TZ", "Asia/Karachi"))
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
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
    on = claude_read.enabled()
    return jsonify({"enabled": on, "configured": on, "source": claude_read.key_source(), "model": claude_read.MODEL, "mediaTypes": list(claude_read.MEDIA_TYPES),
                    "message": "" if on else claude_read.NOT_SET_UP}), (200 if on else 501)


@app.post("/api/read-image")
@auth.login_required
def api_read_image():
    if not claude_read.enabled():
        return jsonify({"error": "not_configured", "message": claude_read.NOT_SET_UP}), 501
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


# ---------- AI reading settings (v21: the Anthropic key, kept in the meta table, never in the docs export) ----------

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
    if body.get("clearKey"):
        out["apiKey"] = ""
        out["lastTest"] = None
    else:
        key = body.get("apiKey")
        if not isinstance(key, str) or not key.strip():
            return jsonify({"error": "no_key", "message": "Paste the API key first."}), 400
        key = key.strip()
        if len(key) < 20 or len(key) > 400 or re.search(r"\s", key):
            return jsonify({"error": "bad_key", "message": "That does not look like an Anthropic API key (it starts with sk-ant- and has no spaces)."}), 400
        out["apiKey"] = key
        out["lastTest"] = None
    out["savedAt"] = db.now_iso()
    db.set_meta("ai", out)
    db.audit("admin", "ai.settings", "key cleared" if body.get("clearKey") else "key saved", auth.client_ip())
    return jsonify(claude_read.public_ai_settings(out))


@app.post("/api/ai-test")
@auth.login_required
def api_ai_test():
    """Validate a key with one request that costs no tokens; report the API's error message as-is."""
    body = request.get_json(silent=True) or {}
    typed = str(body.get("apiKey") or "").strip()
    key = typed or claude_read.api_key()
    if not key:
        return jsonify({"error": "not_configured", "message": "No API key yet: paste one above and save it."}), 400
    stored = not typed or typed == claude_read.stored_key()
    result = {"ok": True, "at": db.now_iso()}
    try:
        result["model"] = claude_read.test_key(key)
    except claude_read.ReadError as e:
        result.update(ok=False, error=e.code, message=e.message)
        if stored:
            m = claude_read.ai_settings()
            m["lastTest"] = result
            db.set_meta("ai", m)
        db.audit("admin", "ai.test.error", e.code, auth.client_ip())
        return jsonify({"error": e.code, "message": e.message, "lastTest": result}), e.status
    if stored:
        m = claude_read.ai_settings()
        m["lastTest"] = result
        db.set_meta("ai", m)
    db.audit("admin", "ai.test", result["model"], auth.client_ip())
    return jsonify({"ok": True, "model": result["model"], "at": result["at"], "lastTest": result})


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
                    "amountText": p.get("amountText") or "", "paid": bool(p.get("paid")), "priceText": p.get("priceText") or "", "switch": sw})
    return out


@app.route("/c/<token>", methods=["GET", "POST"])
def confirm(token):
    if not TOKEN_RE.match(token):
        abort(404)
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
    return render_template("confirm.html", app_name=APP_NAME, tagline=TAGLINE, missing=True), 404


@app.errorhandler(413)
def too_large(_e):
    return jsonify({"error": "too_large", "message": "Upload is larger than 12 MB."}), 413


if __name__ == "__main__":
    app.run(host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "8080")), debug=False)
