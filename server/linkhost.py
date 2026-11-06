"""v57: which address the customers' links (/c/<token>) use, shared by app.py and notify.py.

Order: LINK_DOMAIN in /etc/payments-tracker.env, else the Public base URL typed in Settings when its name can be found
(a DNS lookup on this server), else this server's own address (DOMAIN). A name that cannot be found (a deleted DuckDNS
name, a typo) is never used, so a stale setting cannot send customers to an address that does not exist.
v59: a resolver that answers every unknown name with a fixed address (ISP "search help" pages, captive portals) made every
name look found; such answers are detected with a random probe name and treated as not found, and the reserved names
.invalid / .test / .example (RFC 2606) are never looked up.
v60: every lookup is capped at LOOKUP_SECONDS (a hung resolver no longer stalls a Settings save or the reminder job),
the hijack probe uses three random names under different endings and keeps the union, and the host cache is bounded.
"""
import os
import random
import re
import socket
import string
import threading
import time
from urllib.parse import urlsplit

_HOST_RE = re.compile(r"^[a-z0-9.-]+$")
_cache = {}  # host -> (found, checked_at)
OK_SECONDS, MISS_SECONDS = 600, 60  # a missing name is re-checked after a minute, so adding it in DuckDNS takes effect soon
_RESERVED = (".invalid", ".test", ".example")  # RFC 2606: never real names
LOOKUP_SECONDS = 3.0  # v60: the longest one lookup may take; a slower resolver counts as not found (re-checked after MISS_SECONDS)
CACHE_MAX = 256  # v60: hosts kept; the oldest checks are dropped beyond this
_PROBE_TLDS = (".invalid", ".com", ".net")  # v60: a resolver may answer reserved and real endings differently
_hijack = {"ips": frozenset(), "at": 0.0}  # v59: addresses a hijacking resolver gives for names that do not exist


def _addrs(host):
    """The IP addresses a name resolves to (empty = not found, or no answer within LOOKUP_SECONDS)."""
    out = []

    def run():
        try:
            out.append(frozenset(a[4][0] for a in socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)))
        except (OSError, UnicodeError):
            out.append(frozenset())

    t = threading.Thread(target=run, daemon=True)  # getaddrinfo has no timeout of its own
    t.start()
    t.join(LOOKUP_SECONDS)
    return out[0] if out else frozenset()


def _random_label():
    return "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(20))


def hijack_ips(now=None):
    """v59: addresses the resolver answers for names that cannot exist (a random label), cached OK_SECONDS. Empty = honest resolver."""
    now = time.time() if now is None else now
    if now - _hijack["at"] < OK_SECONDS:
        return _hijack["ips"]
    ips = frozenset()
    for tld in _PROBE_TLDS:
        ips |= _addrs(_random_label() + "-nx-" + _random_label()[:8] + tld)
    _hijack.update(ips=ips, at=now)
    return ips


def env_base(name):
    d = re.sub(r"^https?://", "", os.environ.get(name, "").strip().lower()).split("/")[0]
    return ("https://" + d) if d and _HOST_RE.match(d) else ""


def clean_url(v):
    t = str(v or "").strip().rstrip("/")
    return t[:200] if re.match(r"^https?://\S+$", t, re.I) else ""


def host_of(url):
    try:
        return (urlsplit(url).hostname or "").lower()
    except ValueError:
        return ""


def host_found(host):
    if not host or not _HOST_RE.match(host) or len(host) > 253:
        return False
    now = time.time()
    hit = _cache.get(host)
    if hit and now - hit[1] < (OK_SECONDS if hit[0] else MISS_SECONDS):
        return hit[0]
    if host.endswith(_RESERVED) or host in ("invalid", "test", "example"):
        found = False
    else:
        ips = _addrs(host)
        # an answer made only of the resolver's "no such name" addresses is a miss, not a hit
        found = bool(ips) and not ips <= hijack_ips(now)
    if len(_cache) >= CACHE_MAX:
        for k in sorted(_cache, key=lambda k: _cache[k][1])[: CACHE_MAX // 4]:
            _cache.pop(k, None)
    _cache[host] = (found, now)
    return found


def links_base(settings_url):
    """The base for customer links: LINK_DOMAIN, else the Settings URL if its name is found, else https://DOMAIN ('' locally)."""
    lb = env_base("LINK_DOMAIN")
    if lb:
        return lb
    u = clean_url(settings_url)
    if u and host_found(host_of(u)):
        return u
    return env_base("DOMAIN")
