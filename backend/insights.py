from datetime import date, timedelta
from collections import defaultdict
from typing import List
import db


CONTEXT_LABELS = {
    "coding": "tu codes",
    "stress": "tu es stressé·e",
    "bored": "tu t'ennuies",
    "other": "dans d'autres situations",
}

WEEKDAY_LABELS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]


async def generate_insights() -> List[str]:
    end = date.today()
    start = end - timedelta(days=30)
    checkins = await db.get_checkins_range(start.isoformat(), end.isoformat())

    biting = [c for c in checkins if c["biting"]]

    if len(biting) < 5:
        return ["Pas encore assez de données pour des insights. Continue à logger!"]

    insights = []

    # Context analysis
    context_counts = defaultdict(int)
    for c in biting:
        ctx = c.get("context") or "other"
        context_counts[ctx] += 1

    total_biting = len(biting)
    if context_counts:
        worst_ctx = max(context_counts, key=context_counts.get)
        worst_pct = round(context_counts[worst_ctx] / total_biting * 100)
        label = CONTEXT_LABELS.get(worst_ctx, worst_ctx)
        insights.append(f"Tu ronges {worst_pct}% du temps quand {label}.")

    # Hour analysis
    hour_counts = defaultdict(int)
    for c in biting:
        try:
            hour = int(c["timestamp"][11:13])
            hour_counts[hour] += 1
        except (IndexError, ValueError):
            pass

    if hour_counts:
        worst_hour = max(hour_counts, key=hour_counts.get)
        insights.append(f"Ton heure la plus risquée: {worst_hour}h–{worst_hour + 1}h.")

    # Day of week analysis
    day_counts = defaultdict(int)
    for c in biting:
        try:
            d = date.fromisoformat(c["timestamp"][:10])
            day_counts[d.weekday()] += 1
        except (ValueError, IndexError):
            pass

    if day_counts:
        worst_day = max(day_counts, key=day_counts.get)
        day_label = WEEKDAY_LABELS[worst_day]
        insights.append(f"Le {day_label} est ton jour le plus difficile.")

    # Weekly trend
    this_week_start = end - timedelta(days=7)
    last_week_start = end - timedelta(days=14)

    this_week = [c for c in biting if c["timestamp"][:10] >= this_week_start.isoformat()]
    last_week = [
        c
        for c in biting
        if last_week_start.isoformat() <= c["timestamp"][:10] < this_week_start.isoformat()
    ]

    if last_week:
        ratio = len(this_week) / max(len(last_week), 1)
        if ratio < 0.7:
            insights.append("Cette semaine: nette amélioration vs la semaine dernière!")
        elif ratio > 1.3:
            insights.append("Cette semaine un peu plus difficile que la précédente.")
        else:
            insights.append("Rythme stable cette semaine vs la semaine dernière.")

    # Urge catches
    urges_caught = [c for c in checkins if c.get("type") == "urge"]
    if urges_caught:
        insights.append(
            f"Tu as résisté à {len(urges_caught)} envies ce mois-ci — c'est énorme!"
        )

    # Context comparison: biting vs urge context
    if context_counts and urges_caught:
        urge_contexts = defaultdict(int)
        for c in urges_caught:
            ctx = c.get("context") or "other"
            urge_contexts[ctx] += 1
        if urge_contexts:
            best_resist_ctx = max(urge_contexts, key=urge_contexts.get)
            label = CONTEXT_LABELS.get(best_resist_ctx, best_resist_ctx)
            insights.append(f"Tu résistes mieux quand {label}.")

    return insights


async def generate_weekly_summary() -> dict:
    end = date.today()
    start = end - timedelta(days=7)
    checkins = await db.get_checkins_range(start.isoformat(), end.isoformat())

    biting = [c for c in checkins if c["biting"]]
    urges = [c for c in checkins if c.get("type") == "urge"]

    # Best day (fewest biting)
    day_counts = defaultdict(int)
    for c in biting:
        day_counts[c["timestamp"][:10]] += 1

    best_day = None
    if day_counts:
        best_day = min(day_counts, key=day_counts.get)

    # Worst context
    ctx_counts = defaultdict(int)
    for c in biting:
        ctx = c.get("context") or "other"
        ctx_counts[ctx] += 1

    worst_context = max(ctx_counts, key=ctx_counts.get) if ctx_counts else None

    return {
        "biting_count": len(biting),
        "urges_caught": len(urges),
        "best_day": best_day,
        "worst_context": worst_context,
    }
