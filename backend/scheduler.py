import asyncio
import json
import logging
import os
import random
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from typing import List

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from pywebpush import WebPushException, webpush

import db
import insights as insights_module

logger = logging.getLogger(__name__)

VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_EMAIL = os.getenv("VAPID_EMAIL", "mailto:admin@example.com")
PIN_HASH = os.getenv("PIN_HASH", "")
PINGS_PER_DAY = int(os.getenv("PINGS_PER_DAY", "5"))

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

    weights = await get_hour_weights()
    ping_times = generate_ping_times(PINGS_PER_DAY, weights)

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


async def send_push_to_all(payload: dict):
    subscriptions = await db.get_all_subscriptions()
    if not subscriptions:
        return

    for sub in subscriptions:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub["endpoint"],
                    "keys": {"p256dh": sub["keys_p256dh"], "auth": sub["keys_auth"]},
                },
                data=json.dumps(payload),
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_EMAIL},
            )
        except WebPushException as e:
            logger.warning(f"Push failed for {sub['endpoint'][:40]}…: {e}")
            if e.response and e.response.status_code in (404, 410):
                await db.delete_subscription(sub["endpoint"])
        except Exception as e:
            logger.error(f"Unexpected push error: {e}")


async def send_ping_notification():
    now = datetime.utcnow().isoformat()
    today = date.today().isoformat()
    await db.add_ping(today, now)

    payload = {
        "title": "🧤 Mitaines",
        "body": "Est-ce que tu ronges là?",
        "tag": "mitaines-check",
        "requireInteraction": True,
        "actions": [
            {"action": "clean", "title": "✅ Clean"},
            {"action": "biting", "title": "😬 Je ronge"},
        ],
        "data": {"token": PIN_HASH, "type": "ping"},
    }
    await send_push_to_all(payload)
    logger.info(f"Ping sent at {now}")


async def send_weekly_summary():
    summary = await insights_module.generate_weekly_summary()

    count = summary["biting_count"]
    urges = summary["urges_caught"]
    ctx = summary.get("worst_context") or "?"

    if count == 0:
        body = f"Semaine parfaite! 0 rongement. {urges} envies résistées. Incroyable! 🎉"
    else:
        body = f"Cette semaine: {count} rongements, {urges} envies résistées. Contexte dominant: {ctx}."

    payload = {
        "title": "🧤 Bilan de la semaine",
        "body": body,
        "tag": "mitaines-weekly",
        "data": {"type": "weekly"},
    }
    await send_push_to_all(payload)
    logger.info("Weekly summary sent")
