import asyncio
import logging
import os
import random
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from typing import List

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

import db
import insights as insights_module
import notifier

logger = logging.getLogger(__name__)

PIN_HASH = os.getenv("PIN_HASH", "")
PINGS_PER_DAY_DEFAULT = int(os.getenv("PINGS_PER_DAY", "5"))

scheduler = AsyncIOScheduler()


def setup_scheduler():
    scheduler.add_job(schedule_daily_pings, CronTrigger(hour=0, minute=5), id="daily_ping_scheduler")
    scheduler.add_job(
        send_weekly_summary, CronTrigger(day_of_week="sun", hour=20, minute=0), id="weekly_summary"
    )
    scheduler.start()
    logger.info("Scheduler started")

    # Schedule today's pings immediately on startup
    asyncio.get_event_loop().call_soon(lambda: asyncio.ensure_future(schedule_daily_pings()))


async def get_hour_weights() -> List[float]:
    end = date.today()
    start = end - timedelta(days=30)
    checkins = await db.get_checkins_range(start.isoformat(), end.isoformat())

    # Hours 9–21 (9am to 9pm, last ping at 9pm so window is 9–22)
    hour_weights = defaultdict(lambda: 1.0)
    for c in checkins:
        if c["biting"]:
            try:
                hour = int(c["timestamp"][11:13])
                if 9 <= hour <= 21:
                    hour_weights[hour] += 2.0
            except (IndexError, ValueError):
                pass

    return [hour_weights[h] for h in range(9, 22)]


def generate_ping_times(n: int, weights: List[float]) -> List[time]:
    hours_pool = list(range(9, 22))
    chosen_hours = random.choices(hours_pool, weights=weights, k=n)

    times = []
    used = set()
    for h in chosen_hours:
        minute = random.randint(0, 59)
        key = (h, minute // 10)
        while key in used:
            minute = random.randint(0, 59)
            key = (h, minute // 10)
        used.add(key)
        times.append(time(h, minute, random.randint(0, 59)))

    return sorted(times)


async def schedule_daily_pings():
    today = date.today()
    today_str = today.isoformat()

    # Remove any existing ping jobs for today
    for job in scheduler.get_jobs():
        if job.id.startswith(f"ping_{today_str}"):
            job.remove()

    pings_per_day_str = await db.get_setting("pings_per_day")
    pings_per_day = int(pings_per_day_str) if pings_per_day_str else PINGS_PER_DAY_DEFAULT

    weights = await get_hour_weights()
    ping_times = generate_ping_times(pings_per_day, weights)

    now = datetime.now()
    for t in ping_times:
        run_at = datetime.combine(today, t)
        if run_at > now:
            job_id = f"ping_{today_str}_{t.hour:02d}{t.minute:02d}"
            scheduler.add_job(
                send_ping_notification,
                "date",
                run_date=run_at,
                id=job_id,
            )

    logger.info(f"Scheduled {len(ping_times)} pings for {today_str}: {ping_times}")


async def send_ping_notification():
    now = datetime.utcnow().isoformat()
    today = date.today().isoformat()
    await db.add_ping(today, now)
    await notifier.send_ping(PIN_HASH)
    logger.info(f"Ping sent at {now}")


async def send_real_ping_delayed(delay_seconds: int = 15):
    await asyncio.sleep(delay_seconds)
    await send_ping_notification()


async def send_weekly_summary():
    summary = await insights_module.generate_weekly_summary()
    await notifier.send_weekly_summary(
        biting_count=summary["biting_count"],
        urges_caught=summary["urges_caught"],
        worst_context=summary.get("worst_context"),
    )
    logger.info("Weekly summary sent")
