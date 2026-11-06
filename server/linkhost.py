"""v57: which address the customers' links (/c/<token>) use, shared by app.py and notify.py.

Order: LINK_DOMAIN in /etc/payments-tracker.env, else the Public base URL typed in Settings when its name can be found
(a DNS lookup on this server), else this server's own address (DOMAIN). A name that cannot be found (a deleted DuckDNS
name, a typo) is never used, so a stale setting cannot send customers to an address that does not exist.
v59: a resolver that answers every unknown name with a fixed address (ISP "search help" pages, captive portals) made every
name look found; such answers are detected with a random probe name and treated as not found, and the reserved names
.invalid / .test / .example (RFC 2606) are never looked up.
"""
import os
import random
import re
import socket
import string
import time
from urllib.parse import urlsplit

_HOST_RE = re.compile(r"^[a-z0-9.-]+$")
_cache = {}  # host -> (found, checked_at)
OK_SECONDS, MISS_SECONDS = 600, 60  # a missing name is re-checked after a minute, so adding it in DuckDNS takes effect soon
_RESERVED = (".invalid", ".test", ".example")  # RFC 2606: never real names
_hijack = {"ips": frozenset(), "at": 0.0}  # v59: addresses a hijacking resolver gives for names that do not exist


def _addrs(host):
    """The IP addresses a name resolves to (empty = not found)."""
    try:
        return frozenset(a[4][0] for a in socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP))
    except (OSError, UnicodeError):
        return frozenset()


def hijack_ips(now=None):
    """v59: addresses the resolver answers for names that cannot exist (a random label), cached OK_SECONDS. Empty = honest resolver."""
    now = time.time() if now is None else now
    if now - _hijack["at"] < OK_SECONDS:
        return _hijack["ips"]
    label = "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(20))
    ips = _addrs(label + ".invalid") | _addrs(label + "-nx-" + label[:8] + ".com")
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
