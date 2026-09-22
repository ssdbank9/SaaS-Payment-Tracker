"""Forward statement screenshots or text to the Claude Messages API (raw HTTP, stdlib only).

Used by POST /api/read-image.  The frontend expects the same result the claude.ai
``sample.json`` capability gives it: the parsed JSON Claude replied with, or an
``invalid_json`` error carrying the raw text.
"""
import base64
import json
import os
import re
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db  # noqa: E402

API_URL = "https://api.anthropic.com/v1/messages"
MODELS_URL = "https://api.anthropic.com/v1/models"
API_VERSION = "2023-06-01"
MODEL = os.environ.get("READ_MODEL", "claude-haiku-4-5-20251001")
MAX_TOKENS = 8192
MEDIA_TYPES = ("image/png", "image/jpeg", "image/webp", "image/gif")
MAX_IMAGE_BYTES = 5 * 1024 * 1024
NOT_SET_UP = "Screenshot reading isn't set up yet: paste an API key in Settings → AI reading."


def ai_settings():
    """v21: the key pasted in Settings > AI reading, kept in the meta table (never in the docs export)."""
    m = db.get_meta("ai")
    return m if isinstance(m, dict) else {}


def stored_key(m=None):
    m = ai_settings() if m is None else m
    return str(m.get("apiKey") or "").strip()


def env_key():
    return os.environ.get("ANTHROPIC_API_KEY", "").strip()


def api_key():
    """The key from Settings wins; ANTHROPIC_API_KEY in the environment remains the fallback."""
    return stored_key() or env_key()


def key_source():
    return "settings" if stored_key() else ("env" if env_key() else "")


def key_hint(k):
    k = str(k or "")
    return (k[:7] + "…" + k[-4:]) if len(k) >= 16 else ("•" * len(k))


def public_ai_settings(m=None):
    """What the admin page may see: never the key itself."""
    m = ai_settings() if m is None else m
    k = stored_key(m)
    return {"hasKey": bool(k), "keyHint": key_hint(k) if k else "", "source": key_source(), "configured": enabled(), "model": MODEL,
            "savedAt": m.get("savedAt", ""), "lastTest": m.get("lastTest") if isinstance(m.get("lastTest"), dict) else None}


def enabled():
    return bool(api_key())


def _api_error_detail(e):
    try:
        return json.loads(e.read().decode("utf-8")).get("error", {}).get("message", "")
    except Exception:
        return ""


def test_key(key):
    """One cheap request that costs no tokens: GET /v1/models/<MODEL>. Returns the model's display name;
    raises ReadError carrying the API's own error message (invalid key, no access, model retired...)."""
    key = str(key or "").strip()
    if not key:
        raise ReadError("not_configured", "No API key to test.", 400)
    req = urllib.request.Request(MODELS_URL + "/" + MODEL, headers={"x-api-key": key, "anthropic-version": API_VERSION})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = _api_error_detail(e)
        code = "invalid_key" if e.code in (401, 403) else "rate_limited" if e.code == 429 else "api_error"
        raise ReadError(code, detail or ("Claude API returned HTTP %d" % e.code), 400 if e.code in (401, 403, 404) else 502)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise ReadError("api_error", "Could not reach the Claude API: %s" % e, 502)
    return str(payload.get("display_name") or payload.get("id") or MODEL)


class ReadError(Exception):
    def __init__(self, code, message="", status=502, text=""):
        super().__init__(message or code)
        self.code = code
        self.message = message
        self.status = status
        self.text = text


def _extract_json(text):
    """Pull the first JSON array or object out of a reply that may include prose or fences."""
    t = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", t)
    if fence:
        t = fence.group(1).strip()
    try:
        return json.loads(t)
    except ValueError:
        pass
    for opener, closer in (("[", "]"), ("{", "}")):
        i = t.find(opener)
        j = t.rfind(closer)
        if i >= 0 and j > i:
            try:
                return json.loads(t[i:j + 1])
            except ValueError:
                continue
    raise ReadError("invalid_json", "Claude replied but the reply was not JSON.", 200, text)


def read(prompt, images=()):
    """``images`` is an iterable of (media_type, bytes).  Returns (parsed_json, raw_text)."""
    if not enabled():
        raise ReadError("not_configured", NOT_SET_UP, 501)
    content = []
    for media_type, data in images:
        if media_type not in MEDIA_TYPES:
            raise ReadError("image_rejected", "Unsupported image type %s." % media_type, 415)
        if len(data) > MAX_IMAGE_BYTES:
            raise ReadError("image_rejected", "Image is larger than 5 MB.", 413)
        content.append({"type": "image", "source": {"type": "base64", "media_type": media_type, "data": base64.b64encode(data).decode("ascii")}})
    content.append({"type": "text", "text": prompt})
    body = json.dumps({"model": MODEL, "max_tokens": MAX_TOKENS, "messages": [{"role": "user", "content": content}]}).encode("utf-8")
    req = urllib.request.Request(API_URL, data=body, method="POST", headers={
        "Content-Type": "application/json",
        "x-api-key": api_key(),
        "anthropic-version": API_VERSION,
    })
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = _api_error_detail(e)
        code = "rate_limited" if e.code == 429 else "invalid_key" if e.code in (401, 403) else "api_error"
        raise ReadError(code, detail or ("Claude API returned HTTP %d" % e.code), 502)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise ReadError("api_error", "Could not reach the Claude API: %s" % e, 502)
    if payload.get("stop_reason") == "refusal":
        raise ReadError("refused", "Claude declined this request.", 200)
    text = "".join(b.get("text", "") for b in payload.get("content", []) if b.get("type") == "text")
    return _extract_json(text), text
