"""v57: which address the customers' links (/c/<token>) use, shared by app.py and notify.py.

Order: LINK_DOMAIN in /etc/payments-tracker.env, else the Public base URL typed in Settings when its name can be found
(a DNS lookup on this server), else this server's own address (DOMAIN). A name that cannot be found (a deleted DuckDNS
name, a typo) is never used, so a stale setting cannot send customers to an address that does not exist.
"""
import os
import re
import socket
import time
from urllib.parse import urlsplit

_HOST_RE = re.compile(r"^[a-z0-9.-]+$")
_cache = {}  # host -> (found, checked_at)
OK_SECONDS, MISS_SECONDS = 600, 60  # a missing name is re-checked after a minute, so adding it in DuckDNS takes effect soon


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
    try:
        socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
        found = True
    except (OSError, UnicodeError):
        found = False
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
