"""Forward statement screenshots or text to Google Gemini (generateContent, raw HTTP, stdlib only).

v23: the second reading provider next to ``claude_read``.  Same prompt, same JSON row
structure, same ``ReadError`` codes, so POST /api/read-image can dispatch on the provider
chosen in Settings → AI reading.  The key travels in the ``x-goog-api-key`` header, never
in the URL, so it does not end up in access logs.
"""
import base64
import json
import re
import urllib.error
import urllib.parse
import urllib.request

import claude_read
from claude_read import MAX_IMAGE_BYTES, MEDIA_TYPES, ReadError, ai_settings, key_hint

BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
MAX_OUTPUT_TOKENS = 8192
MODEL_RE = re.compile(r"^[A-Za-z0-9._-]{1,80}$")
# Models that answer generateContent but cannot read a statement: embeddings, speech, image/video generation...
SKIP_RE = re.compile(r"embedding|tts|image|audio|live|veo|imagen|aqa|robotics|computer-use|deep-research", re.I)
NOT_SET_UP = "Screenshot reading isn't set up yet: paste a Gemini API key in Settings → AI reading."
NO_MODEL = "Gemini key saved but no model chosen: press Load models in Settings → AI reading and save."


def stored_key(m=None):
    m = ai_settings() if m is None else m
    return str(m.get("geminiKey") or "").strip()


def stored_model(m=None):
    m = ai_settings() if m is None else m
    return norm_model(m.get("geminiModel"))


def norm_model(v):
    v = str(v or "").strip()
    if v.startswith("models/"):
        v = v[len("models/"):]
    return v if MODEL_RE.match(v) else ""


def enabled(m=None):
    m = ai_settings() if m is None else m
    return bool(stored_key(m) and stored_model(m))


def not_set_up_message(m=None):
    m = ai_settings() if m is None else m
    return NO_MODEL if stored_key(m) and not stored_model(m) else NOT_SET_UP


def public_settings(m=None):
    m = ai_settings() if m is None else m
    k = stored_key(m)
    return {"hasKey": bool(k), "keyHint": key_hint(k) if k else "", "model": stored_model(m), "configured": enabled(m)}


def _api_error_detail(e):
    try:
        err = json.loads(e.read().decode("utf-8")).get("error", {})
        msg = str(err.get("message") or "")
        return msg
    except Exception:
        return ""


def _request(method, path, key, body=None, timeout=60, query=None):
    """One call to the Gemini REST API; HTTP errors become ReadError carrying the API's own message."""
    key = str(key or "").strip()
    if not key:
        raise ReadError("not_configured", "No Gemini API key.", 400)
    url = BASE_URL + path + (("?" + urllib.parse.urlencode(query)) if query else "")
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"x-goog-api-key": key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = _api_error_detail(e)
        code = "invalid_key" if e.code in (400, 401, 403) and re.search(r"api key|permission|unauthenticated|forbidden", detail, re.I) else \
            "rate_limited" if e.code == 429 else "not_found" if e.code == 404 else "api_error"
        status = 400 if code in ("invalid_key", "not_found") else 502
        raise ReadError(code, detail or ("Gemini API returned HTTP %d" % e.code), status)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise ReadError("api_error", "Could not reach the Gemini API: %s" % e, 502)


def _version_of(name):
    m = re.search(r"gemini-(\d+(?:\.\d+)?)", name)
    return float(m.group(1)) if m else 0.0


def _is_stable(name):
    return not re.search(r"preview|exp|latest|\d{2}-\d{2}", name)


def list_models(key):
    """Every model that supports generateContent and can read pictures, flash-lite first, then flash, newest first.
    Each entry: {id, displayName, description, flash, lite, stable, version}."""
    models = []
    token = ""
    for _ in range(5):
        q = {"pageSize": 200}
        if token:
            q["pageToken"] = token
        payload = _request("GET", "/models", key, query=q, timeout=30)
        for m in payload.get("models") or []:
            name = str(m.get("name") or "")
            mid = name[len("models/"):] if name.startswith("models/") else name
            methods = m.get("supportedGenerationMethods") or []
            if "generateContent" not in methods or not MODEL_RE.match(mid) or SKIP_RE.search(mid):
                continue
            low = mid.lower()
            models.append({"id": mid, "displayName": str(m.get("displayName") or mid), "description": str(m.get("description") or "")[:200],
                           "flash": "flash" in low, "lite": "lite" in low, "stable": _is_stable(low), "version": _version_of(low)})
        token = payload.get("nextPageToken") or ""
        if not token:
            break
    models.sort(key=lambda x: (0 if x["flash"] and x["lite"] else 1 if x["flash"] else 2, -x["version"], 0 if x["stable"] else 1, x["id"]))
    return models


def pick_default(models):
    """The newest model whose name has both "flash" and "lite" (a stable one before a preview of the same version);
    otherwise the newest flash model; otherwise the first in the list.  Never a hard-coded id."""
    lite = [m for m in models if m["flash"] and m["lite"]]
    if lite:
        return lite[0]["id"]
    flash = [m for m in models if m["flash"]]
    if flash:
        return flash[0]["id"]
    return models[0]["id"] if models else ""


def test_key(key, model=""):
    """One tiny request. With a model: generateContent asking for the word OK (a handful of tokens), which proves
    the key can use that model.  Without one: list the models, which costs nothing.  Returns a label for the status line."""
    model = norm_model(model)
    if not model:
        models = list_models(key)
        return "key accepted · %d model%s available, pick one" % (len(models), "" if len(models) == 1 else "s")
    body = {"contents": [{"role": "user", "parts": [{"text": "Reply with the single word OK."}]}],
            "generationConfig": {"maxOutputTokens": 8, "temperature": 0}}
    payload = _request("POST", "/models/%s:generateContent" % urllib.parse.quote(model), key, body, timeout=45)
    if not payload.get("candidates") and payload.get("promptFeedback", {}).get("blockReason"):
        raise ReadError("refused", "Gemini blocked the test prompt: %s" % payload["promptFeedback"]["blockReason"], 502)
    return model


def _text_of(payload):
    cands = payload.get("candidates") or []
    if not cands:
        pf = payload.get("promptFeedback") or {}
        if pf.get("blockReason"):
            raise ReadError("refused", "Gemini declined this image (%s)." % pf["blockReason"], 200)
        raise ReadError("api_error", "Gemini returned no answer.", 502)
    c = cands[0]
    if c.get("finishReason") in ("SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII"):
        raise ReadError("refused", "Gemini declined this image (%s)." % c.get("finishReason"), 200)
    parts = (c.get("content") or {}).get("parts") or []
    return "".join(str(p.get("text") or "") for p in parts if isinstance(p, dict))


def read(prompt, images=(), key=None, model=None):
    """``images`` is an iterable of (media_type, bytes).  Returns (parsed_json, raw_text)."""
    m = ai_settings()
    key = str(key or stored_key(m)).strip()
    model = norm_model(model) or stored_model(m)
    if not key or not model:
        raise ReadError("not_configured", not_set_up_message(m), 501)
    parts = []
    for media_type, data in images:
        if media_type not in MEDIA_TYPES:
            raise ReadError("image_rejected", "Unsupported image type %s." % media_type, 415)
        if len(data) > MAX_IMAGE_BYTES:
            raise ReadError("image_rejected", "Image is larger than 5 MB.", 413)
        parts.append({"inline_data": {"mime_type": media_type, "data": base64.b64encode(data).decode("ascii")}})
    parts.append({"text": prompt})
    body = {"contents": [{"role": "user", "parts": parts}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0, "maxOutputTokens": MAX_OUTPUT_TOKENS}}
    path = "/models/%s:generateContent" % urllib.parse.quote(model)
    try:
        payload = _request("POST", path, key, body, timeout=120)
    except ReadError as e:
        # An older model that does not take a JSON response type: ask again and parse the text ourselves.
        if e.code == "api_error" and re.search(r"response_?mime_?type|responseMimeType", e.message or "", re.I):
            body["generationConfig"].pop("responseMimeType", None)
            payload = _request("POST", path, key, body, timeout=120)
        else:
            raise
    text = _text_of(payload)
    return claude_read._extract_json(text, "Gemini"), text
