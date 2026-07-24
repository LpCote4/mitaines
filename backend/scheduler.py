import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

import insights as insights_module
import notifier

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


def setup_scheduler():
    scheduler.add_job(
        send_weekly_summary, CronTrigger(day_of_week="sun", hour=20, minute=0), id="weekly_summary"
    )
    scheduler.start()
    logger.info("Scheduler started")


async def send_weekly_summary():
    summary = await insights_module.generate_weekly_summary()
    await notifier.send_weekly_summary(
        biting_count=summary["biting_count"],
        urges_caught=summary["urges_caught"],
        worst_context=summary.get("worst_context"),
    )
    logger.info("Weekly summary sent")
