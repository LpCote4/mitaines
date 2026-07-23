import logging
import os
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import db
import economy as economy_module
import insights as insights_module
import scheduler as scheduler_module

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Mitaines API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PIN_HASH = os.getenv("PIN_HASH", "")
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "")
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY", "")
LAPTOP_GOAL_DAYS = int(os.getenv("LAPTOP_GOAL_DAYS", "90"))
PINGS_PER_DAY_DEFAULT = int(os.getenv("PINGS_PER_DAY", "5"))

MILESTONE_DEFS = [
    ("first_clean_day", "Premier jour clean"),
    ("streak_3", "3 jours de suite"),
    ("streak_7", "Une semaine entière"),
    ("streak_30", "Un mois complet"),
    ("streak_90", "Objectif laptop!"),
    ("first_urge_caught", "Première envie résistée"),
    ("urges_10", "10 envies résistées"),
    ("urges_50", "50 envies résistées"),
]


@app.on_event("startup")
async def startup():
    await db.init_db()
    scheduler_module.setup_scheduler()


# ── Auth ──────────────────────────────────────────────────────────────────────

async def require_auth(authorization: Optional[str] = Header(default=None)):
    if not PIN_HASH:
        return
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization")
    token = authorization[7:]
    if token != PIN_HASH:
        raise HTTPException(status_code=401, detail="Invalid token")


class PinVerify(BaseModel):
    pin_hash: str


@app.post("/api/v1/auth/verify")
async def verify_pin(data: PinVerify):
    if not PIN_HASH:
        return {"ok": True}
    if data.pin_hash == PIN_HASH:
        return {"ok": True}
    raise HTTPException(status_code=401, detail="Invalid PIN")


# ── Checkins ──────────────────────────────────────────────────────────────────

class CheckinCreate(BaseModel):
    biting: bool
    context: Optional[str] = None
    type: str = "manual"


@app.post("/api/v1/checkins")
async def create_checkin(data: CheckinCreate, _=Depends(require_auth)):
    now = datetime.utcnow()
    now_iso = now.isoformat()

    checkin_type = data.type
    if checkin_type != "urge":
        cutoff = (now - timedelta(minutes=15)).isoformat()
        if await db.get_latest_ping_since(cutoff):
            checkin_type = "ping_response"

    await db.add_checkin(now_iso, data.biting, data.context, checkin_type)
    await check_and_unlock_milestones()

    # Economy: biting adds a (per-day-capped) penalty; anything else banks a
    # rate-limited credit toward the laptop.
    if data.biting:
        econ = await economy_module.apply_bite_penalty(now)
    else:
        econ = await economy_module.apply_checkin_credit(now)

    return {"ok": True, "economy": econ}


@app.get("/api/v1/checkins")
async def list_checkins(date_filter: Optional[str] = None, _=Depends(require_auth)):
    if date_filter:
        return await db.get_checkins_for_date(date_filter)
    return await db.get_all_checkins()


# ── Economy ───────────────────────────────────────────────────────────────────

async def require_admin(x_admin_token: Optional[str] = Header(default=None)):
    if not ADMIN_TOKEN:
        raise HTTPException(status_code=503, detail="Admin token not configured")
    if x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid admin token")


@app.get("/api/v1/economy")
async def get_economy(_=Depends(require_auth)):
    return await economy_module.state()


@app.get("/api/v1/economy/ledger")
async def get_ledger(limit: int = 100, _=Depends(require_auth)):
    return await db.get_ledger(limit)


@app.get("/api/v1/events/active")
async def get_active_event(_=Depends(require_auth)):
    return {"active": await economy_module.active_event()}


@app.get("/api/v1/events/upcoming")
async def get_upcoming_events(_=Depends(require_auth)):
    now = datetime.utcnow().isoformat()
    return {"events": await db.get_upcoming_events(now)}


class EventCreate(BaseModel):
    key: str
    label: str
    multiplier: float = 2.0
    starts_at: Optional[str] = None      # ISO; defaults to now
    duration_hours: Optional[float] = None
    ends_at: Optional[str] = None        # ISO; overrides duration_hours
    meta: Optional[dict] = None


@app.post("/api/v1/admin/events")
async def create_event(data: EventCreate, _=Depends(require_admin)):
    import json as _json
    now = datetime.utcnow()
    starts = datetime.fromisoformat(data.starts_at) if data.starts_at else now
    if data.ends_at:
        ends = datetime.fromisoformat(data.ends_at)
    elif data.duration_hours is not None:
        ends = starts + timedelta(hours=data.duration_hours)
    else:
        ends = starts + timedelta(hours=24)
    event_id = await db.add_event(
        data.key, data.label, data.multiplier,
        starts.isoformat(), ends.isoformat(), now.isoformat(),
        _json.dumps(data.meta) if data.meta else None,
    )
    return {"ok": True, "id": event_id, "starts_at": starts.isoformat(), "ends_at": ends.isoformat()}


class BonusCreate(BaseModel):
    amount: float
    event_key: str = "bonus"


@app.post("/api/v1/admin/bonus")
async def grant_bonus(data: BonusCreate, _=Depends(require_admin)):
    return await economy_module.apply_event_bonus(data.amount, data.event_key)


class AdjustCreate(BaseModel):
    delta: float
    note: str = "manual"


@app.post("/api/v1/admin/adjust")
async def adjust_economy(data: AdjustCreate, _=Depends(require_admin)):
    return await economy_module.manual_adjust(data.delta, data.note)


# ── Evenings ──────────────────────────────────────────────────────────────────

class EveningCreate(BaseModel):
    intensity: int
    context: Optional[str] = None
    note: Optional[str] = None


@app.post("/api/v1/evenings")
async def create_evening(data: EveningCreate, _=Depends(require_auth)):
    today = date.today().isoformat()
    await db.upsert_evening(today, data.intensity, data.context, data.note)
    return {"ok": True}


@app.get("/api/v1/evenings/{date_str}")
async def get_evening(date_str: str, _=Depends(require_auth)):
    evening = await db.get_evening(date_str)
    if not evening:
        raise HTTPException(status_code=404)
    return evening


# ── Stats ─────────────────────────────────────────────────────────────────────

@app.get("/api/v1/stats/summary")
async def get_summary(_=Depends(require_auth)):
    today = date.today()
    all_checkins = await db.get_all_checkins()

    current_streak = compute_current_streak(all_checkins, today)
    longest_streak = compute_longest_streak(all_checkins)

    today_str = today.isoformat()
    today_checkins = [c for c in all_checkins if c["timestamp"].startswith(today_str)]
    today_biting = sum(1 for c in today_checkins if c["biting"])
    today_urges = sum(1 for c in today_checkins if c["type"] == "urge")
    today_ping_responses = sum(1 for c in today_checkins if c["type"] == "ping_response")

    today_pings = await db.get_pings_for_date(today_str)

    return {
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "laptop_goal_days": LAPTOP_GOAL_DAYS,
        "today_biting": today_biting,
        "today_urges": today_urges,
        "today_responses": today_ping_responses,
        "today_pings": len(today_pings),
    }


@app.get("/api/v1/stats/daily")
async def get_daily_stats(_=Depends(require_auth)):
    end = date.today()
    start = end - timedelta(days=29)
    checkins = await db.get_checkins_range(start.isoformat(), end.isoformat())

    # Build per-day counts
    by_date = defaultdict(lambda: {"biting": 0, "clean": 0, "urges": 0, "total": 0})
    for c in checkins:
        d = c["timestamp"][:10]
        by_date[d]["total"] += 1
        if c["biting"]:
            by_date[d]["biting"] += 1
        elif c["type"] == "urge":
            by_date[d]["urges"] += 1
        else:
            by_date[d]["clean"] += 1

    # Get ping counts per day
    ping_by_date = {}
    for i in range(30):
        d = (start + timedelta(days=i)).isoformat()
        pings = await db.get_pings_for_date(d)
        ping_by_date[d] = len(pings)

    result = []
    for i in range(30):
        d = (start + timedelta(days=i)).isoformat()
        data = by_date[d]
        pings_sent = ping_by_date.get(d, 0)
        coverage = round(data["total"] / pings_sent, 2) if pings_sent > 0 else None
        result.append({"date": d, **data, "pings_sent": pings_sent, "coverage": coverage})

    return result


@app.get("/api/v1/stats/heatmap")
async def get_heatmap(_=Depends(require_auth)):
    end = date.today()
    start = end - timedelta(days=34)
    checkins = await db.get_checkins_range(start.isoformat(), end.isoformat())

    by_date = defaultdict(lambda: {"biting": 0, "total": 0})
    for c in checkins:
        d = c["timestamp"][:10]
        by_date[d]["total"] += 1
        if c["biting"]:
            by_date[d]["biting"] += 1

    result = []
    for i in range(35):
        d = (start + timedelta(days=i)).isoformat()
        data = by_date[d]
        result.append(
            {
                "date": d,
                "biting": data["biting"],
                "total": data["total"],
                "tracked": data["total"] > 0,
            }
        )

    return result


@app.get("/api/v1/stats/hourly")
async def get_hourly_stats(_=Depends(require_auth)):
    end = date.today()
    start = end - timedelta(days=30)
    checkins = await db.get_checkins_range(start.isoformat(), end.isoformat())

    hour_biting = defaultdict(int)
    hour_total = defaultdict(int)
    for c in checkins:
        try:
            hour = int(c["timestamp"][11:13])
            hour_total[hour] += 1
            if c["biting"]:
                hour_biting[hour] += 1
        except (IndexError, ValueError):
            pass

    return [
        {"hour": h, "biting": hour_biting[h], "total": hour_total[h]}
        for h in range(8, 23)
    ]


@app.get("/api/v1/stats/context")
async def get_context_stats(_=Depends(require_auth)):
    end = date.today()
    start = end - timedelta(days=30)
    checkins = await db.get_checkins_range(start.isoformat(), end.isoformat())

    counts = defaultdict(int)
    for c in checkins:
        if c["biting"]:
            ctx = c.get("context") or "other"
            counts[ctx] += 1

    total = sum(counts.values())
    return [
        {"context": k, "count": v, "pct": round(v / total * 100) if total else 0}
        for k, v in sorted(counts.items(), key=lambda x: -x[1])
    ]


# ── Day detail ────────────────────────────────────────────────────────────────

@app.get("/api/v1/days/{date_str}")
async def get_day_detail(date_str: str, _=Depends(require_auth)):
    checkins = await db.get_checkins_for_date(date_str)
    pings = await db.get_pings_for_date(date_str)
    evening = await db.get_evening(date_str)
    return {"date": date_str, "checkins": checkins, "pings": pings, "evening": evening}


# ── Insights ──────────────────────────────────────────────────────────────────

@app.get("/api/v1/insights")
async def get_insights(_=Depends(require_auth)):
    texts = await insights_module.generate_insights()
    return {"insights": texts}


# ── Milestones ────────────────────────────────────────────────────────────────

@app.get("/api/v1/milestones")
async def list_milestones(_=Depends(require_auth)):
    unshown = await db.get_unshown_milestones()
    all_ms = await db.get_all_milestones()
    unlocked_keys = {m["key"] for m in all_ms}
    return {
        "unshown": unshown,
        "unlocked": [m["key"] for m in all_ms],
        "definitions": [
            {"key": k, "label": l, "unlocked": k in unlocked_keys}
            for k, l in MILESTONE_DEFS
        ],
    }


@app.post("/api/v1/milestones/{key}/acknowledge")
async def acknowledge_milestone(key: str, _=Depends(require_auth)):
    await db.mark_milestone_shown(key)
    return {"ok": True}


# ── Push ──────────────────────────────────────────────────────────────────────

@app.get("/api/v1/push/vapid-public-key")
async def get_vapid_public_key():
    return {"publicKey": VAPID_PUBLIC_KEY}


class PushSubscription(BaseModel):
    endpoint: str
    keys: dict


@app.post("/api/v1/push/subscribe")
async def subscribe_push(sub: PushSubscription, _=Depends(require_auth)):
    await db.save_subscription(sub.endpoint, sub.keys.get("p256dh", ""), sub.keys.get("auth", ""))
    return {"ok": True}


class UnsubscribeRequest(BaseModel):
    endpoint: str


@app.delete("/api/v1/push/unsubscribe")
async def unsubscribe_push(data: UnsubscribeRequest, _=Depends(require_auth)):
    await db.delete_subscription(data.endpoint)
    return {"ok": True}


# ── Settings ──────────────────────────────────────────────────────────────────

@app.get("/api/v1/settings")
async def get_settings(_=Depends(require_auth)):
    pings_per_day_str = await db.get_setting("pings_per_day")
    pings_per_day = int(pings_per_day_str) if pings_per_day_str else PINGS_PER_DAY_DEFAULT
    return {
        "pings_per_day": pings_per_day,
        "pings_per_day_default": PINGS_PER_DAY_DEFAULT,
        "laptop_goal_days": LAPTOP_GOAL_DAYS,
        "push_configured": bool(VAPID_PUBLIC_KEY),
    }


class SettingsUpdate(BaseModel):
    pings_per_day: Optional[int] = None


@app.patch("/api/v1/settings")
async def update_settings(data: SettingsUpdate, _=Depends(require_auth)):
    if data.pings_per_day is not None:
        if not (1 <= data.pings_per_day <= 20):
            raise HTTPException(status_code=400, detail="pings_per_day must be between 1 and 20")
        await db.set_setting("pings_per_day", str(data.pings_per_day))
        await scheduler_module.schedule_daily_pings()
    return {"ok": True}


# ── Push test ─────────────────────────────────────────────────────────────────

@app.post("/api/v1/push/ping-now")
async def ping_now(_=Depends(require_auth)):
    import asyncio
    asyncio.create_task(scheduler_module.send_real_ping_delayed(5))
    return {"ok": True, "delay_seconds": 5}


# ── Export ────────────────────────────────────────────────────────────────────

@app.get("/api/v1/export")
async def export_data(_=Depends(require_auth)):
    from fastapi.responses import JSONResponse

    checkins = await db.get_all_checkins()
    evenings = await db.get_all_evenings()
    milestones = await db.get_all_milestones()

    return JSONResponse(
        content={"checkins": checkins, "evenings": evenings, "milestones": milestones},
        headers={"Content-Disposition": "attachment; filename=mitaines-export.json"},
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

def compute_current_streak(checkins: list, today: date) -> int:
    dates_with_checkin = {c["timestamp"][:10] for c in checkins}
    biting_dates = {c["timestamp"][:10] for c in checkins if c["biting"]}

    streak = 0
    d = today
    while True:
        d_str = d.isoformat()
        if d_str in biting_dates:
            break
        if d != today and d_str not in dates_with_checkin:
            # Past day with no log → assume biting
            break
        if d_str in dates_with_checkin:
            streak += 1
        d -= timedelta(days=1)

    return streak


def compute_longest_streak(checkins: list) -> int:
    if not checkins:
        return 0

    dates_with_checkin = {c["timestamp"][:10] for c in checkins}
    biting_dates = {c["timestamp"][:10] for c in checkins if c["biting"]}
    clean_dates = sorted(dates_with_checkin - biting_dates)

    if not clean_dates:
        return 0

    longest = 1
    current = 1
    for i in range(1, len(clean_dates)):
        d1 = date.fromisoformat(clean_dates[i - 1])
        d2 = date.fromisoformat(clean_dates[i])
        if (d2 - d1).days == 1:
            current += 1
            longest = max(longest, current)
        else:
            current = 1

    return longest


async def check_and_unlock_milestones():
    all_checkins = await db.get_all_checkins()
    today = date.today()
    now = datetime.utcnow().isoformat()

    streak = compute_current_streak(all_checkins, today)
    longest = compute_longest_streak(all_checkins)

    biting_ever = any(c["biting"] for c in all_checkins)
    clean_days_exist = any(
        not any(
            cc["biting"]
            for cc in all_checkins
            if cc["timestamp"][:10] == c["timestamp"][:10]
        )
        for c in all_checkins
    )

    urges = [c for c in all_checkins if c.get("type") == "urge"]
    total_urges = len(urges)

    to_unlock = []

    if clean_days_exist:
        to_unlock.append("first_clean_day")
    if streak >= 3 or longest >= 3:
        to_unlock.append("streak_3")
    if streak >= 7 or longest >= 7:
        to_unlock.append("streak_7")
    if streak >= 30 or longest >= 30:
        to_unlock.append("streak_30")
    if streak >= 90 or longest >= 90:
        to_unlock.append("streak_90")
    if total_urges >= 1:
        to_unlock.append("first_urge_caught")
    if total_urges >= 10:
        to_unlock.append("urges_10")
    if total_urges >= 50:
        to_unlock.append("urges_50")

    for key in to_unlock:
        await db.unlock_milestone(key, now)
