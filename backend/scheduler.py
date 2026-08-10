import logging
import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

import db
import economy as economy_module
import insights as insights_module
import notifier

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

# Hours after the last credited check-in at which to nudge lp. 1h = the moment
# the credit becomes available; the rest are escalating (doubling) reminders so
# a quiet day gets fewer, spaced-out pings, not spam. Any new credited check-in
# reschedules the whole series from scratch.
REMINDER_OFFSETS_H = [1, 2, 4, 8, 16, 32, 64, 128]
REMINDER_JOB_PREFIX = "credit_reminder_"

APP_TZ = ZoneInfo(os.getenv("APP_TZ", "America/Toronto"))
# Never push a notification while lp is presumably asleep. A reminder that
# would land in this local window gets deferred to the end of it instead of
# firing at 1am/3am/7am, which is what made the escalating series feel random.
QUIET_HOURS_START = 23  # 23:00 local
QUIET_HOURS_END = 8     # 08:00 local


def _defer_past_quiet_hours(run_at_utc: datetime) -> datetime:
    """run_at_utc is naive, representing UTC (this codebase's convention).
    Returns a naive UTC datetime, pushed to QUIET_HOURS_END local time if it
    landed inside the quiet window."""
    aware_utc = run_at_utc.replace(tzinfo=timezone.utc)
    local = aware_utc.astimezone(APP_TZ)
    in_quiet = local.hour >= QUIET_HOURS_START or local.hour < QUIET_HOURS_END
    if not in_quiet:
        return run_at_utc
    wake = local.replace(hour=QUIET_HOURS_END, minute=0, second=0, microsecond=0)
    if local.hour >= QUIET_HOURS_START:
        wake += timedelta(days=1)
    return wake.astimezone(timezone.utc).replace(tzinfo=None)


def setup_scheduler():
    scheduler.add_job(
        send_weekly_summary, CronTrigger(day_of_week="sun", hour=20, minute=0), id="weekly_summary"
    )
    scheduler.start()
    logger.info("Scheduler started")


async def schedule_credit_reminders():
    """(Re)schedule the credit-ready notification + escalating reminders based on
    the last credited check-in. Called after each credited check-in and on
    startup; clears any pending reminders first."""
    for job in scheduler.get_jobs():
        if job.id.startswith(REMINDER_JOB_PREFIX):
            job.remove()

    last = await db.get_last_credit_ts()
    if not last:
        return
    base = datetime.fromisoformat(last)
    now = datetime.utcnow()
    # Several offsets can get deferred onto the same post-quiet-hours wake time
    # (e.g. +1h/+2h/+4h/+8h overnight all land at 8am). Firing all of them back
    # to back would just be a different flavor of spam, so keep only the
    # largest (most accurate) offset per distinct run time.
    slots: dict[datetime, int] = {}
    for h in REMINDER_OFFSETS_H:
        run_at = _defer_past_quiet_hours(base + timedelta(hours=h))
        if run_at <= now:
            continue
        if run_at not in slots or h > slots[run_at]:
            slots[run_at] = h
    scheduled = []
    for run_at, h in sorted(slots.items()):
        scheduler.add_job(send_credit_reminder, "date", run_date=run_at,
                          id=f"{REMINDER_JOB_PREFIX}{h}", args=[h, run_at.isoformat()],
                          replace_existing=True)
        scheduled.append((h, run_at.isoformat()))
    logger.info(f"Credit reminders scheduled at {scheduled} from {base.isoformat()}")


# Backwards-compatible alias (main.py may call either name).
schedule_credit_ready_notification = schedule_credit_reminders


async def send_credit_reminder(hours: int, scheduled_for: str | None = None):
    now = datetime.utcnow()
    last = await db.get_last_credit_ts()
    if not last:
        return
    elapsed_h = (now - datetime.fromisoformat(last)).total_seconds() / 3600
    # If a more recent credited check-in happened, this scheduled offset is stale
    # (a newer reminder chain took over) — skip so we never show a wrong elapsed.
    if elapsed_h < hours - 0.25:
        logger.info(f"Skip stale reminder (+{hours}h; only {elapsed_h:.2f}h since last credit)")
        await db.log_reminder("credit_reminder", now.isoformat(), "skipped_stale",
                               offset_h=hours, elapsed_h=elapsed_h, last_credit_ts=last,
                               scheduled_for=scheduled_for)
        return
    if hours <= 1:
        await notifier.send_credit_ready()
    else:
        # Message uses the *actual* elapsed time, not the scheduled offset.
        await notifier.send_credit_reminder(round(elapsed_h))
    logger.info(f"Credit reminder sent (~{elapsed_h:.1f}h since last credit)")
    await db.log_reminder("credit_reminder", now.isoformat(), "sent",
                           offset_h=hours, elapsed_h=elapsed_h, last_credit_ts=last,
                           scheduled_for=scheduled_for)


async def send_weekly_summary():
    summary = await insights_module.generate_weekly_summary()
    await notifier.send_weekly_summary(
        biting_count=summary["biting_count"],
        urges_caught=summary["urges_caught"],
        worst_context=summary.get("worst_context"),
    )
    logger.info("Weekly summary sent")
