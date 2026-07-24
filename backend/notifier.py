import json
import logging
import os

import httpx

logger = logging.getLogger(__name__)

NTFY_TOPIC = os.getenv("NTFY_TOPIC", "")
NTFY_BASE = "https://ntfy.sh"
APP_URL = os.getenv("APP_URL", "https://lpcote.ca/mitaines")
API_URL = os.getenv("API_URL", "https://lpcote.ca/api/v1")
PIN_HASH = os.getenv("PIN_HASH", "")

_PRIORITY_MAP = {"min": 1, "low": 2, "default": 3, "high": 4, "max": 5}


async def _send(title: str, body: str, tags: list[str], priority: str = "default", actions: list[dict] | None = None) -> None:
    if not NTFY_TOPIC:
        logger.warning("NTFY_TOPIC not configured, notification skipped")
        return

    payload: dict = {
        "title": title,
        "message": body,
        "priority": _PRIORITY_MAP.get(priority, 3),
        "tags": tags,
    }
    if actions:
        payload["actions"] = actions

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{NTFY_BASE}/{NTFY_TOPIC}",
                content=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                timeout=10,
            )
            logger.info(f"ntfy response {resp.status_code}: {resp.text[:200]}")
            resp.raise_for_status()
        logger.info(f"ntfy sent: {title}")
    except Exception as e:
        logger.error(f"ntfy error: {e}")


async def send_weekly_summary(biting_count: int, urges_caught: int, worst_context: str | None) -> None:
    if biting_count == 0:
        body = f"Semaine parfaite! 0 rongement. {urges_caught} envies résistées. Incroyable! 🎉"
        priority = "high"
    else:
        ctx = worst_context or "?"
        body = f"Cette semaine: {biting_count} rongements, {urges_caught} envies résistées. Contexte dominant: {ctx}."
        priority = "default"

    await _send(
        title="🧤 Bilan de la semaine",
        body=body,
        tags=["nail_care", "calendar"],
        priority=priority,
    )
