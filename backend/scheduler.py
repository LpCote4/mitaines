import logging
from datetime import datetime, timedelta

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
    scheduled = []
    for h in REMINDER_OFFSETS_H:
        run_at = base + timedelta(hours=h)
        if run_at <= now:
            continue
        scheduler.add_job(send_credit_reminder, "date", run_date=run_at,
                          id=f"{REMINDER_JOB_PREFIX}{h}", args=[h])
        scheduled.append(h)
    logger.info(f"Credit reminders scheduled at +{scheduled}h from {base.isoformat()}")


# Backwards-compatible alias (main.py may call either name).
schedule_credit_ready_notification = schedule_credit_reminders


async def send_credit_reminder(hours: int):
    # A credited check-in cancels+reschedules all reminder jobs, so a job that
    # actually fires is never stale.
    if hours <= 1:
        await notifier.send_credit_ready()
    else:
        await notifier.send_credit_reminder(hours)
    logger.info(f"Credit reminder sent (+{hours}h)")


async def send_weekly_summary():
    summary = await insights_module.generate_weekly_summary()
    await notifier.send_weekly_summary(
        biting_count=summary["biting_count"],
        urges_caught=summary["urges_caught"],
        worst_context=summary.get("worst_context"),
    )
    logger.info("Weekly summary sent")
