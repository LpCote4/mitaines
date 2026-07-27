import logging
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

import db
import economy as economy_module
import insights as insights_module
import notifier

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

CREDIT_READY_JOB = "credit_ready"


def setup_scheduler():
    scheduler.add_job(
        send_weekly_summary, CronTrigger(day_of_week="sun", hour=20, minute=0), id="weekly_summary"
    )
    scheduler.start()
    logger.info("Scheduler started")


async def schedule_credit_ready_notification():
    """Schedule a one-shot ntfy notification for the moment the next credit
    becomes available (last credit + cooldown). Called after each credited
    check-in and on startup; reschedules/replaces any pending one."""
    existing = scheduler.get_job(CREDIT_READY_JOB)
    if existing:
        existing.remove()

    last = await db.get_last_credit_ts()
    if not last:
        return
    ready_at = datetime.fromisoformat(last) + economy_module.CREDIT_COOLDOWN
    if ready_at <= datetime.utcnow():
        return  # already available — don't fire a stale notification

    scheduler.add_job(send_credit_ready, "date", run_date=ready_at, id=CREDIT_READY_JOB)
    logger.info(f"Credit-ready notification scheduled for {ready_at.isoformat()}")


async def send_credit_ready():
    await notifier.send_credit_ready()
    logger.info("Credit-ready notification sent")


async def send_weekly_summary():
    summary = await insights_module.generate_weekly_summary()
    await notifier.send_weekly_summary(
        biting_count=summary["biting_count"],
        urges_caught=summary["urges_caught"],
        worst_context=summary.get("worst_context"),
    )
    logger.info("Weekly summary sent")
