"""Wasool daily notifier: emails today's queue stage to subscribers who still need it.

Run once a day (payments-tracker-notify.timer, 09:00 Asia/Karachi). Reads the same
SQLite store the admin page writes: settings/main (anchor, reminder and reply-by days,
the three stage templates), users/<id> (email, per-cycle ticks), confirm/<token> (the
per-cycle amounts the admin page renders for the subscriber's link page) and the
answers recorded on the link pages.  SMTP settings live in the ``meta`` table
(PUT /api/mail-settings from the admin page); without them it logs "mail not
configured" and exits 0.

Stages, from the date alone (same rule as the admin page's Queue):
  1  reminder        from the reminder day (20th) to the day before the reply-by day
  2  repeat          on/after the reply-by day (23rd), to anyone without an answer
  3  final note      on the cycle start (24th): the account continues, tier and amount due
"""
import json
import logging
import os
import re
import smtplib
import ssl
import sys
from datetime import date, datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import formataddr
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db  # noqa: E402

log = logging.getLogger("notify")
TZ = ZoneInfo(os.environ.get("APP_TZ", "Asia/Karachi"))
DEFAULT_ANCHOR = "2026-07-24"
DEFAULT_REMIND_DAY, DEFAULT_REPLY_DAY = 20, 23
DEFAULT_APP_NAME = "Wasool"
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# Keep in step with DEFAULT_QUEUE_TPL / DEFAULT_PAY_HOW in index.html.
DEFAULT_TEMPLATES = {
    "1": "Hi {name}, your {tier} plan renews on {dueDate} for {cycle}. Amount due: {amount}. Please pick one on your private link by {replyBy} — Continue, {switchLabel}, or Discontinue: {link}",
    "2": "Hi {name}, quick follow-up: I have not heard back about your {tier} plan for {cycle} ({amount} due {dueDate}). Today is the last day to choose — Continue, {switchLabel}, or Discontinue: {link} If I do not hear from you, the account simply continues as it is.",
    "3": "Hi {name}, as I did not hear back, your {tier} account continues from {dueDate} for {cycle}. Amount due: {amount}. {payHow} Your plan and options stay here: {link}",
}
DEFAULT_PAY_HOW = "Please pay the way you usually do (NayaPay, bank transfer or USDT) and send me the receipt."
PLACEHOLDER_RE = re.compile(r"\{(name|amount|cycle|link|tier|dueDate|replyBy|switchLabel|payHow|appName)\}")
SUBJECTS = {"1": "{appName}: your {tier} plan for {cycle}", "2": "{appName}: last day to choose for {cycle}", "3": "{appName}: your {tier} account continues from {dueDate}"}


# ---------- mail settings + sending ----------

def mail_settings():
    m = db.get_meta("mail")
    return m if isinstance(m, dict) else {}


def mail_configured(m=None):
    m = mail_settings() if m is None else m
    return bool(m.get("host") and m.get("user") and m.get("password"))


def public_mail_settings(m=None):
    """What the admin page may see: everything but the password, plus whether one is stored."""
    m = mail_settings() if m is None else m
    return {"host": m.get("host", ""), "port": int(m.get("port") or 587), "user": m.get("user", ""), "fromName": m.get("fromName", ""),
            "fromEmail": m.get("fromEmail", ""), "testTo": m.get("testTo", ""), "hasPassword": bool(m.get("password")), "configured": mail_configured(m)}


def send_mail(m, to, subject, body):
    """Send one plain-text email over SMTP (STARTTLS on 587/25, implicit TLS on 465). Raises on failure."""
    port = int(m.get("port") or 587)
    msg = EmailMessage()
    sender = m.get("fromEmail") or m.get("user")
    msg["From"] = formataddr((m.get("fromName") or DEFAULT_APP_NAME, sender))
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    ctx = ssl.create_default_context()
    if os.environ.get("SMTP_INSECURE") == "1":  # local debug servers only
        ctx = None
    if port == 465:
        with smtplib.SMTP_SSL(m["host"], port, timeout=30, context=ctx or ssl.create_default_context()) as s:
            s.login(m["user"], m["password"])
            s.send_message(msg)
    else:
        with smtplib.SMTP(m["host"], port, timeout=30) as s:
            s.ehlo()
            if ctx is not None and s.has_extn("starttls"):
                s.starttls(context=ctx)
                s.ehlo()
            if m.get("password") and (ctx is None or s.has_extn("auth")):
                try:
                    s.login(m["user"], m["password"])
                except smtplib.SMTPNotSupportedError:
                    if ctx is not None:
                        raise
            s.send_message(msg)


# ---------- cycle arithmetic (mirrors index.html) ----------

def parse_d(s):
    y, m, d = (int(x) for x in s.split("-"))
    return date(y, m, d)


def iso(d):
    return d.isoformat()


def days_in(y, m):
    nxt = date(y + (m // 12), m % 12 + 1, 1)
    return (nxt - date(y, m, 1)).days


def add_months(s, n):
    y, m, d = (int(x) for x in s.split("-"))
    total = (m - 1) + n
    ny, nm = y + total // 12, total % 12 + 1
    return iso(date(ny, nm, min(d, days_in(ny, nm))))


def add_days(s, n):
    return iso(parse_d(s) + timedelta(days=n))


def day_on_or_before(s, day):
    y, m = int(s[:4]), int(s[5:7])
    for _ in range(3):
        d = iso(date(y, m, min(day, days_in(y, m))))
        if d <= s:
            return d
        m -= 1
        if m < 1:
            m, y = 12, y - 1
    return s


def next_cycle_start(today, anchor):
    a, b = anchor.split("-"), today.split("-")
    j = (int(b[0]) - int(a[0])) * 12 + (int(b[1]) - int(a[1])) - 1
    g = 0
    while add_months(anchor, j) <= today and g < 40:
        j += 1
        g += 1
    return add_months(anchor, j)


def reminder_window(today, anchor, remind_day, reply_day):
    nc = next_cycle_start(today, anchor)
    reply_by = day_on_or_before(add_days(nc, -1), reply_day)
    start = day_on_or_before(reply_by, remind_day)
    return {"nc": nc, "start": start, "replyBy": reply_by}


def stage_today(today, anchor, remind_day, reply_day):
    """(stage, cycle_start): stage 3 on a cycle start day, else 2 from the reply-by day, 1 from the reminder day, 0 otherwise."""
    if add_months(next_cycle_start(today, anchor), -1) == today:
        return 3, today
    w = reminder_window(today, anchor, remind_day, reply_day)
    if today >= w["replyBy"]:
        return 2, w["nc"]
    if today >= w["start"]:
        return 1, w["nc"]
    return 0, w["nc"]


def fmt_d(s, full=False):
    y, m, d = s.split("-")
    return "%s %d%s" % (MONTHS[int(m) - 1], int(d), (", " + y) if full else "")


def clamp_day(v, default):
    try:
        n = int(round(float(v)))
    except (TypeError, ValueError):
        return default
    return n if 1 <= n <= 31 else default


# ---------- rendering ----------

def render(tpl, fields):
    out = PLACEHOLDER_RE.sub(lambda m: str(fields.get(m.group(1), "")), tpl)
    if fields.get("link") and "{link}" not in tpl:
        out += " Reply here: " + fields["link"]
    return out


def templates(settings):
    t = settings.get("queueTemplates") if isinstance(settings.get("queueTemplates"), dict) else {}
    return {k: (str(t.get(k) or "").strip() or DEFAULT_TEMPLATES[k]) for k in DEFAULT_TEMPLATES}


def fields_for(card, ctx, settings, base):
    tok = ctx.get("token", "")
    return {
        "name": ctx.get("name") or "there", "appName": (settings.get("appName") or "").strip() or DEFAULT_APP_NAME,
        "tier": card.get("tierText") or "", "amount": card.get("amountText") or "", "cycle": card.get("periodText") or "",
        "dueDate": card.get("dueDateText") or "", "replyBy": card.get("replyByText") or "", "switchLabel": card.get("switchLabel") or "Upgrade",
        "payHow": (settings.get("payHow") or "").strip() or DEFAULT_PAY_HOW, "link": str(ctx.get("link") or "") or ((base + "/c/" + tok) if base and tok else ""),
    }


# ---------- the job ----------

def _card(ctx, cycle):
    cycles = ctx.get("cycles") if isinstance(ctx.get("cycles"), dict) else {}
    card = cycles.get(cycle)
    if not card and ctx.get("cycleStart") == cycle and isinstance(ctx.get("plans"), list):
        card = ctx  # pre-v20-style doc for the same cycle
    return card if isinstance(card, dict) else None


def run(today=None, dry_run=False):
    m = mail_settings()
    if not mail_configured(m):
        log.info("mail not configured (set SMTP in Settings > Mail); nothing sent")
        return 0
    sdoc = db.get_doc("settings/main")
    settings = (sdoc or {}).get("data") or {}
    anchor = settings.get("anchor") if re.match(r"^\d{4}-\d{2}-\d{2}$", str(settings.get("anchor") or "")) else DEFAULT_ANCHOR
    remind_day, reply_day = clamp_day(settings.get("remindDay"), DEFAULT_REMIND_DAY), clamp_day(settings.get("replyDay"), DEFAULT_REPLY_DAY)
    today = today or os.environ.get("WASOOL_TODAY") or iso(datetime.now(TZ).date())
    stage, cycle = stage_today(today, anchor, remind_day, reply_day)
    if not stage:
        log.info("%s: no queue stage today (next cycle %s); nothing to send", today, cycle)
        return 0
    base = str(settings.get("publicBaseUrl") or "").rstrip("/")  # the admin page also writes each user's link into the confirm doc
    tpls = templates(settings)
    key = str(stage)
    by_user = {}
    for d in db.list_docs("confirm/"):
        data = d["data"]
        if isinstance(data, dict) and data.get("userId"):
            data = dict(data, token=d["path"].split("/", 1)[1])
            by_user[data["userId"]] = data
    answered = {a["user_id"] for a in db.confirmations_for_cycle(cycle) if a.get("user_id")}
    sent = skipped = 0
    for d in db.list_docs("users/"):
        uid = d["path"].split("/", 1)[1]
        u = d["data"] if isinstance(d["data"], dict) else {}
        name = u.get("name") or u.get("email") or uid
        email = str(u.get("email") or "").strip()
        if u.get("cancel") or not email:
            continue
        if uid in answered:
            log.info("skip %s: already answered for %s", name, cycle)
            continue
        rem = (u.get("reminders") or {}).get(cycle) or {}
        if rem.get("skipped"):
            log.info("skip %s: on the Except list for %s", name, cycle)
            continue
        if any(int(s.get("stage") or 0) == stage for s in rem.get("sent") or [] if isinstance(s, dict)):
            continue
        ctx = by_user.get(uid)
        card = _card(ctx, cycle) if ctx else None
        if not card:
            log.info("skip %s: no amounts for cycle %s yet (open the admin page once to refresh the link pages)", name, cycle)
            skipped += 1
            continue
        if not card.get("due"):
            continue
        f = fields_for(card, ctx, settings, base)
        subject, body = render(SUBJECTS[key], f), render(tpls[key], f)
        if dry_run:
            log.info("would send stage %d to %s <%s>:\n%s", stage, name, email, body)
            continue
        try:
            send_mail(m, email, subject, body)
        except Exception as e:  # noqa: BLE001 - keep going for the other users
            log.error("stage %d to %s <%s> failed: %s", stage, name, email, e)
            continue
        at = db.now_iso()
        fresh = db.get_doc(d["path"])
        u2 = (fresh or d)["data"]
        rm = u2.setdefault("reminders", {})
        r = rm.setdefault(cycle, {})
        r.setdefault("sent", []).append({"stage": stage, "cycleStart": cycle, "channel": "email", "at": at, "by": "notify"})
        if stage == 1 and not r.get("reminded"):
            r["reminded"] = today
        if stage == 2 and not r.get("final"):
            r["final"] = today
        db.set_doc(d["path"], u2)
        db.audit("notify", "mail.sent", "stage %d %s %s" % (stage, cycle, email))
        sent += 1
        log.info("stage %d sent to %s <%s>", stage, name, email)
    log.info("%s: stage %d for cycle %s done: %d sent%s", today, stage, cycle, sent, (", %d without amounts" % skipped) if skipped else "")
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s notify %(levelname)s %(message)s", stream=sys.stdout)
    sys.exit(run(dry_run="--dry-run" in sys.argv))
