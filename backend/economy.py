"""Economy system for Mitaines.

Core idea: a "days to laptop" bank that starts at LAPTOP_GOAL_DAYS (90).
You pay it down by logging clean check-ins; biting pushes it back up.

- Earn: each clean/urge check-in credits CREDIT_PER_CHECKIN (0.1) day off the
  bank, multiplied by any active event multiplier. Rate-limited to one credit
  per CREDIT_COOLDOWN (1h) — extra check-ins still get logged, they just don't
  bank again until the timer elapses.
- Penalty: biting adds days back, scaled by how close you are to the goal
  (small penalty when far, large when almost there). Capped so the bank never
  exceeds the starting value, and one penalty per day max.
- Cagnotte: the bank maps linearly onto a money jar. remaining == goal -> $0,
  remaining == 0 -> CAGNOTTE_TOTAL ($3000). Every day earned = money in the jar.

Everything is derived from an append-only `ledger` table so history is auditable
and the numbers can always be recomputed.
"""

import json
import os
from datetime import date, datetime, timedelta
from typing import Optional

import db

GOAL_DAYS = float(os.getenv("LAPTOP_GOAL_DAYS", "90"))
CAGNOTTE_TOTAL = float(os.getenv("CAGNOTTE_TOTAL", "3000"))
CREDIT_PER_CHECKIN = float(os.getenv("CREDIT_PER_CHECKIN", "0.1"))
CREDIT_COOLDOWN = timedelta(hours=float(os.getenv("CREDIT_COOLDOWN_HOURS", "1")))
PENALTY_COOLDOWN = timedelta(hours=float(os.getenv("PENALTY_COOLDOWN_HOURS", "1")))
PENALTY_MIN = float(os.getenv("PENALTY_MIN", "1"))
PENALTY_MAX = float(os.getenv("PENALTY_MAX", "14"))


# ── Core math ──────────────────────────────────────────────────────────────────

def clamp_remaining(raw: float) -> float:
    return max(0.0, min(GOAL_DAYS, raw))


def cagnotte_for(remaining: float) -> float:
    """Money saved so far, from progress toward the goal."""
    progress = (GOAL_DAYS - remaining) / GOAL_DAYS if GOAL_DAYS else 0.0
    return round(CAGNOTTE_TOTAL * progress, 2)


def penalty_for(remaining: float) -> float:
    """Bite penalty (days added), bigger the closer you are to the goal."""
    progress = (GOAL_DAYS - remaining) / GOAL_DAYS if GOAL_DAYS else 0.0
    progress = max(0.0, min(1.0, progress))
    return round(PENALTY_MIN + (PENALTY_MAX - PENALTY_MIN) * progress, 2)


async def remaining_days() -> float:
    total = await db.ledger_sum()
    return clamp_remaining(GOAL_DAYS + total)


# ── Event multiplier ────────────────────────────────────────────────────────────

async def active_event(now: Optional[datetime] = None) -> Optional[dict]:
    now = now or datetime.utcnow()
    events = await db.get_active_events(now.isoformat())
    if not events:
        return None
    # Highest multiplier wins if several overlap.
    return max(events, key=lambda e: e["multiplier"])


async def current_multiplier(now: Optional[datetime] = None) -> float:
    ev = await active_event(now)
    return ev["multiplier"] if ev else 1.0


# ── State snapshot ──────────────────────────────────────────────────────────────

async def state(now: Optional[datetime] = None) -> dict:
    now = now or datetime.utcnow()
    remaining = await remaining_days()
    ev = await active_event(now)

    last_credit = await db.get_last_credit_ts()
    if last_credit:
        next_credit_at = (datetime.fromisoformat(last_credit) + CREDIT_COOLDOWN)
        credit_ready = now >= next_credit_at
        # Emit an explicit UTC marker so browsers don't parse it as local time.
        next_credit_iso = None if credit_ready else next_credit_at.isoformat() + "Z"
    else:
        credit_ready = True
        next_credit_iso = None

    mult = ev["multiplier"] if ev else 1.0
    return {
        "remaining_days": round(remaining, 2),
        "goal_days": GOAL_DAYS,
        "cagnotte": cagnotte_for(remaining),
        "cagnotte_total": CAGNOTTE_TOTAL,
        "won": remaining <= 0,
        "credit_per_checkin": round(CREDIT_PER_CHECKIN * mult, 3),
        "credit_ready": credit_ready,
        "next_credit_at": next_credit_iso,
        "next_penalty_preview": round(min(penalty_for(remaining), GOAL_DAYS - remaining), 2),
        "active_event": ev,
    }


# ── Mutations ───────────────────────────────────────────────────────────────────

async def _record_clamped(now: datetime, desired_delta: float, reason: str,
                          meta: dict) -> float:
    """Record the *effective* delta after clamping to [0, GOAL_DAYS].

    Clamping at write-time (not just on the final sum) means a penalty can
    never push the bank above the starting value, and a credit can never push
    it below zero — so there's no hidden debt/overshoot that later check-ins
    would silently absorb.
    """
    current = clamp_remaining(GOAL_DAYS + await db.ledger_sum())
    effective = round(clamp_remaining(current + desired_delta) - current, 4)
    meta = {**meta, "desired": round(desired_delta, 4)}
    await db.add_ledger(now.isoformat(), effective, reason, json.dumps(meta))
    return effective


async def apply_checkin_credit(now: Optional[datetime] = None) -> dict:
    """Called on a clean/urge check-in. Returns whether a credit was banked."""
    now = now or datetime.utcnow()
    last_credit = await db.get_last_credit_ts()
    if last_credit:
        ready_at = datetime.fromisoformat(last_credit) + CREDIT_COOLDOWN
        if now < ready_at:
            return {"credited": False, "amount": 0.0, "reason": "cooldown",
                    "next_credit_at": ready_at.isoformat() + "Z", **(await state(now))}

    mult = await current_multiplier(now)
    amount = round(CREDIT_PER_CHECKIN * mult, 3)
    meta = {"multiplier": mult}
    ev = await active_event(now)
    if ev:
        meta["event"] = ev["key"]
    effective = await _record_clamped(now, -amount, "checkin_credit", meta)
    return {"credited": True, "amount": abs(effective), "multiplier": mult, **(await state(now))}


async def apply_bite_penalty(now: Optional[datetime] = None) -> dict:
    """Called on a biting check-in. Rate-limited to one penalty per hour,
    mirroring the clean check-in credit."""
    now = now or datetime.utcnow()
    last_penalty = await db.get_last_ts_for_reason("bite_penalty")
    if last_penalty:
        ready_at = datetime.fromisoformat(last_penalty) + PENALTY_COOLDOWN
        if now < ready_at:
            return {"penalized": False, "amount": 0.0, "reason": "cooldown",
                    "next_penalty_at": ready_at.isoformat() + "Z", **(await state(now))}

    remaining = await remaining_days()
    nominal = penalty_for(remaining)
    effective = await _record_clamped(now, nominal, "bite_penalty",
                                      {"remaining_before": round(remaining, 2)})
    return {"penalized": True, "amount": round(effective, 2), "nominal": nominal,
            **(await state(now))}


async def apply_event_bonus(amount: float, event_key: str,
                            now: Optional[datetime] = None) -> dict:
    """Flat bonus credit (e.g. bounty completion). Not rate-limited."""
    now = now or datetime.utcnow()
    effective = await _record_clamped(now, -abs(amount), "event_bonus",
                                      {"event": event_key})
    return {"credited": True, "amount": abs(effective), **(await state(now))}


async def manual_adjust(delta: float, note: str,
                        now: Optional[datetime] = None) -> dict:
    now = now or datetime.utcnow()
    await _record_clamped(now, delta, "manual_adjust", {"note": note})
    return await state(now)
