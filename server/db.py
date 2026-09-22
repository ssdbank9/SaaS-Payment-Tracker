"""SQLite storage for Wasooli (Payments Tracker).

A generic JSON document store mirroring the claude.ai artifact ``db`` API
(get / set / update / delete / list by prefix), plus tables for public
confirmation answers, login attempts and an audit log.  Only the standard
library is used.
"""
import json
import os
import sqlite3
import threading
from datetime import datetime, timezone

DATA_DIR = os.environ.get("DATA_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
DB_PATH = os.path.join(DATA_DIR, "tracker.sqlite3")
ASSETS_DIR = os.path.join(DATA_DIR, "assets")

_lock = threading.Lock()
_initialised = False

SCHEMA = """
CREATE TABLE IF NOT EXISTS docs (
  path TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS confirmations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL,
  user_id TEXT NOT NULL DEFAULT '',
  cycle_start TEXT NOT NULL,
  answer TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL,
  plan_id TEXT NOT NULL DEFAULT '',
  target_package_id TEXT NOT NULL DEFAULT '',
  applied_at TEXT
);
CREATE INDEX IF NOT EXISTS confirmations_cycle ON confirmations (cycle_start, token, at);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS login_attempts (
  ip TEXT NOT NULL,
  at TEXT NOT NULL,
  ok INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS login_attempts_ip ON login_attempts (ip, at);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO meta (key, value) VALUES ('docs_version', '0');
"""


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def connect():
    """Open a connection (WAL mode, 5 s busy timeout).  Caller closes it."""
    global _initialised
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(ASSETS_DIR, exist_ok=True)
    con = sqlite3.connect(DB_PATH, timeout=5, isolation_level=None)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA synchronous=NORMAL")
    con.execute("PRAGMA foreign_keys=ON")
    if not _initialised:
        with _lock:
            if not _initialised:
                con.executescript(SCHEMA)
                _migrate(con)
                _initialised = True
    return con


# columns added after the first release; ALTER TABLE ADD COLUMN is a no-op for a fresh store
_COLUMNS = {
    "confirmations": [("plan_id", "TEXT NOT NULL DEFAULT ''"), ("target_package_id", "TEXT NOT NULL DEFAULT ''"), ("applied_at", "TEXT")],
}


def _migrate(con):
    for table, cols in _COLUMNS.items():
        have = {r["name"] for r in con.execute("PRAGMA table_info(%s)" % table).fetchall()}
        for name, decl in cols:
            if name not in have:
                con.execute("ALTER TABLE %s ADD COLUMN %s %s" % (table, name, decl))


class _Tx:
    """Context manager: one connection wrapped in a transaction."""

    def __enter__(self):
        self.con = connect()
        self.con.execute("BEGIN IMMEDIATE")
        return self.con

    def __exit__(self, exc_type, exc, tb):
        try:
            if exc_type is None:
                self.con.execute("COMMIT")
            else:
                self.con.execute("ROLLBACK")
        finally:
            self.con.close()
        return False


def tx():
    return _Tx()


def _bump(con):
    con.execute("UPDATE meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'docs_version'")


def version():
    con = connect()
    try:
        row = con.execute("SELECT value FROM meta WHERE key = 'docs_version'").fetchone()
        return int(row["value"]) if row else 0
    finally:
        con.close()


# ---------- meta (server-side settings, kept out of the docs export) ----------

def get_meta(key, default=None):
    con = connect()
    try:
        row = con.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
        if not row:
            return default
        try:
            return json.loads(row["value"])
        except ValueError:
            return row["value"]
    finally:
        con.close()


def set_meta(key, value):
    with tx() as con:
        con.execute("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", (key, json.dumps(value, ensure_ascii=False)))


# ---------- docs ----------

def valid_path(path):
    if not isinstance(path, str) or not path or len(path) > 200:
        return False
    if path.startswith("/") or path.endswith("/") or "//" in path or ".." in path:
        return False
    return all(ch.isalnum() or ch in "/_-.:@" for ch in path)


def _row_to_doc(row):
    return {"path": row["path"], "data": json.loads(row["json"]), "updated_at": row["updated_at"]}


def get_doc(path):
    con = connect()
    try:
        row = con.execute("SELECT path, json, updated_at FROM docs WHERE path = ?", (path,)).fetchone()
        return _row_to_doc(row) if row else None
    finally:
        con.close()


def set_doc(path, data, con=None):
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    at = now_iso()
    if con is not None:
        con.execute("INSERT INTO docs (path, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(path) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at", (path, body, at))
        _bump(con)
        return at
    with tx() as c:
        return set_doc(path, data, c)


def update_doc(path, patch):
    with tx() as con:
        row = con.execute("SELECT json FROM docs WHERE path = ?", (path,)).fetchone()
        data = json.loads(row["json"]) if row else {}
        if not isinstance(data, dict):
            data = {}
        data.update(patch)
        set_doc(path, data, con)
        return data


def delete_doc(path):
    with tx() as con:
        cur = con.execute("DELETE FROM docs WHERE path = ?", (path,))
        if cur.rowcount:
            _bump(con)
        return cur.rowcount > 0


def list_docs(prefix=""):
    con = connect()
    try:
        if prefix:
            rows = con.execute("SELECT path, json, updated_at FROM docs WHERE path >= ? AND path < ? ORDER BY path", (prefix, prefix + "\uffff")).fetchall()
        else:
            rows = con.execute("SELECT path, json, updated_at FROM docs ORDER BY path").fetchall()
        return [_row_to_doc(r) for r in rows]
    finally:
        con.close()


def import_docs(docs, replace_prefixes=()):
    """Bulk set.  ``docs`` is {path: data}.  Docs under any of ``replace_prefixes``
    that are not in ``docs`` are deleted (a whole-collection replace).  Returns
    (written, removed)."""
    n = removed = 0
    with tx() as con:
        for prefix in replace_prefixes:
            rows = con.execute("SELECT path FROM docs WHERE path >= ? AND path < ?", (prefix, prefix + "\uffff")).fetchall()
            for r in rows:
                if r["path"] not in docs:
                    con.execute("DELETE FROM docs WHERE path = ?", (r["path"],))
                    removed += 1
        for path, data in docs.items():
            if not valid_path(path):
                continue
            set_doc(path, data, con)
            n += 1
        if removed:
            _bump(con)
    return n, removed


def find_doc_by_field(prefix, field, value):
    """First doc under ``prefix`` whose JSON ``field`` equals ``value``."""
    for d in list_docs(prefix):
        data = d["data"]
        if isinstance(data, dict) and data.get(field) == value:
            return d
    return None


# ---------- confirmations ----------
# One row per answer. ``answer`` is continue | upgrade | downgrade | discontinue (older rows: yes | no, read as
# continue | discontinue). ``plan_id`` is '' when the answer applies to all of the user's monthly plans.

CHOICES = ("continue", "upgrade", "downgrade", "discontinue")
_LEGACY = {"yes": "continue", "no": "discontinue"}


def norm_choice(a):
    a = str(a or "").lower()
    return _LEGACY.get(a, a)


def record_confirmation(token, user_id, cycle_start, answer, note, ip, user_agent, plan_id="", target_package_id=""):
    at = now_iso()
    with tx() as con:
        con.execute(
            "INSERT INTO confirmations (token, user_id, cycle_start, answer, note, ip, user_agent, at, plan_id, target_package_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (token, user_id, cycle_start, norm_choice(answer), note[:500], ip[:64], user_agent[:300], at, plan_id[:80], target_package_id[:80]),
        )
        _bump(con)
    return at


def _row(r):
    d = dict(r)
    d["answer"] = norm_choice(d.get("answer"))
    return d


_COLS = "c.id, c.token, c.user_id, c.cycle_start, c.answer, c.note, c.at, c.plan_id, c.target_package_id, c.applied_at"


def latest_confirmation(token, cycle_start):
    """Latest answer for a token and cycle regardless of plan (the pre-v20 single answer)."""
    con = connect()
    try:
        row = con.execute(
            "SELECT %s FROM confirmations c WHERE token = ? AND cycle_start = ? ORDER BY id DESC LIMIT 1" % _COLS,
            (token, cycle_start),
        ).fetchone()
        return _row(row) if row else None
    finally:
        con.close()


def latest_confirmations(token, cycle_start):
    """Latest answer per plan_id for one token and cycle, as {plan_id: row} ('' = whole account)."""
    con = connect()
    try:
        rows = con.execute(
            "SELECT %s FROM confirmations c JOIN (SELECT MAX(id) AS mid FROM confirmations WHERE token = ? AND cycle_start = ? GROUP BY plan_id) m ON m.mid = c.id ORDER BY c.at" % _COLS,
            (token, cycle_start),
        ).fetchall()
        return {r["plan_id"]: _row(r) for r in rows}
    finally:
        con.close()


def confirmations_for_cycle(cycle_start):
    """Latest answer per (token, plan_id) for a cycle."""
    con = connect()
    try:
        rows = con.execute(
            "SELECT %s FROM confirmations c JOIN (SELECT MAX(id) AS mid FROM confirmations WHERE cycle_start = ? GROUP BY token, plan_id) m ON m.mid = c.id ORDER BY c.at" % _COLS,
            (cycle_start,),
        ).fetchall()
        return [_row(r) for r in rows]
    finally:
        con.close()


def mark_applied(conf_id):
    """Stamp applied_at on an answer once the admin page has acted on it. Returns the stamp (existing or new)."""
    with tx() as con:
        row = con.execute("SELECT applied_at FROM confirmations WHERE id = ?", (conf_id,)).fetchone()
        if not row:
            return None
        if row["applied_at"]:
            return row["applied_at"]
        at = now_iso()
        con.execute("UPDATE confirmations SET applied_at = ? WHERE id = ?", (at, conf_id))
        _bump(con)
        return at


# ---------- login attempts + audit ----------

def record_login(ip, ok):
    with tx() as con:
        con.execute("INSERT INTO login_attempts (ip, at, ok) VALUES (?, ?, ?)", (ip, now_iso(), 1 if ok else 0))
        con.execute("DELETE FROM login_attempts WHERE at < datetime('now', '-1 day')")


def failed_logins(ip, minutes=15):
    con = connect()
    try:
        row = con.execute(
            "SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND ok = 0 AND at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)",
            (ip, "-%d minutes" % minutes),
        ).fetchone()
        return row["n"]
    finally:
        con.close()


def audit(actor, action, detail="", ip=""):
    try:
        with tx() as con:
            con.execute("INSERT INTO audit (at, actor, action, detail, ip) VALUES (?, ?, ?, ?, ?)", (now_iso(), actor, action, str(detail)[:500], ip[:64]))
    except sqlite3.Error:
        pass


def backup_to(dest_path):
    src = connect()
    try:
        dst = sqlite3.connect(dest_path)
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()
