import aiosqlite
import os
from datetime import datetime, date
from typing import Optional

DB_PATH = os.getenv("DATABASE_PATH", "/data/mitaines.db")

CREATE_TABLES = """
CREATE TABLE IF NOT EXISTS checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    biting INTEGER NOT NULL,
    context TEXT,
    type TEXT NOT NULL DEFAULT 'manual'
);

CREATE TABLE IF NOT EXISTS evenings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    intensity INTEGER NOT NULL,
    context TEXT,
    note TEXT
);

CREATE TABLE IF NOT EXISTS ping_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    sent_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT NOT NULL UNIQUE,
    keys_p256dh TEXT NOT NULL,
    keys_auth TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    unlocked_at TEXT NOT NULL,
    shown INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT NOT NULL PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    delta REAL NOT NULL,
    reason TEXT NOT NULL,
    meta TEXT
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    label TEXT NOT NULL,
    multiplier REAL NOT NULL DEFAULT 2.0,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    meta TEXT
);

CREATE TABLE IF NOT EXISTS reminder_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    offset_h INTEGER,
    elapsed_h REAL,
    last_credit_ts TEXT,
    scheduled_for TEXT,
    sent_at TEXT NOT NULL,
    outcome TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS laptops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model TEXT NOT NULL,
    cpu TEXT,
    passmark INTEGER,
    tdp_w INTEGER,
    ram_gb INTEGER,
    storage_gb INTEGER,
    price_usd REAL,
    build TEXT,
    display TEXT,
    touch INTEGER,
    gpu TEXT,
    url TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ledger_reason ON ledger(reason);
CREATE INDEX IF NOT EXISTS idx_events_window ON events(starts_at, ends_at);
"""


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(CREATE_TABLES)
        # Lightweight migrations for columns added after first release.
        for col, decl in (("touch", "INTEGER"), ("gpu", "TEXT")):
            try:
                await db.execute(f"ALTER TABLE laptops ADD COLUMN {col} {decl}")
            except Exception:
                pass
        await db.commit()


async def log_reminder(kind: str, sent_at: str, outcome: str, offset_h: Optional[int] = None,
                        elapsed_h: Optional[float] = None, last_credit_ts: Optional[str] = None,
                        scheduled_for: Optional[str] = None):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO reminder_log (kind, offset_h, elapsed_h, last_credit_ts, scheduled_for, sent_at, outcome) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (kind, offset_h, elapsed_h, last_credit_ts, scheduled_for, sent_at, outcome),
        )
        await db.commit()


async def get_reminder_log(limit: int = 100) -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM reminder_log ORDER BY sent_at DESC LIMIT ?", (limit,)
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def add_checkin(timestamp: str, biting: bool, context: Optional[str], checkin_type: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO checkins (timestamp, biting, context, type) VALUES (?, ?, ?, ?)",
            (timestamp, int(biting), context, checkin_type),
        )
        await db.commit()


async def get_checkins_for_date(date_str: str) -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM checkins WHERE date(timestamp) = ? ORDER BY timestamp",
            (date_str,),
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def get_checkins_range(start: str, end: str) -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM checkins WHERE date(timestamp) >= ? AND date(timestamp) <= ? ORDER BY timestamp",
            (start, end),
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def get_all_checkins() -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM checkins ORDER BY timestamp") as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def upsert_evening(date_str: str, intensity: int, context: Optional[str], note: Optional[str]):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO evenings (date, intensity, context, note) VALUES (?, ?, ?, ?)
               ON CONFLICT(date) DO UPDATE SET intensity=excluded.intensity,
               context=excluded.context, note=excluded.note""",
            (date_str, intensity, context, note),
        )
        await db.commit()


async def get_evening(date_str: str) -> Optional[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM evenings WHERE date = ?", (date_str,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def get_all_evenings() -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM evenings ORDER BY date") as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def add_ping(date_str: str, sent_at: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO ping_log (date, sent_at) VALUES (?, ?)",
            (date_str, sent_at),
        )
        await db.commit()


async def get_latest_ping_since(since_iso: str) -> Optional[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM ping_log WHERE sent_at >= ? ORDER BY sent_at DESC LIMIT 1",
            (since_iso,),
        ) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def get_pings_for_date(date_str: str) -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM ping_log WHERE date = ? ORDER BY sent_at", (date_str,)
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def get_all_subscriptions() -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM push_subscriptions") as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def save_subscription(endpoint: str, p256dh: str, auth: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO push_subscriptions (endpoint, keys_p256dh, keys_auth, created_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(endpoint) DO UPDATE SET keys_p256dh=excluded.keys_p256dh,
               keys_auth=excluded.keys_auth""",
            (endpoint, p256dh, auth, datetime.utcnow().isoformat()),
        )
        await db.commit()


async def delete_subscription(endpoint: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (endpoint,))
        await db.commit()


async def get_unshown_milestones() -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM milestones WHERE shown = 0 ORDER BY unlocked_at"
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def get_all_milestones() -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM milestones ORDER BY unlocked_at") as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def unlock_milestone(key: str, unlocked_at: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR IGNORE INTO milestones (key, unlocked_at, shown) VALUES (?, ?, 0)",
            (key, unlocked_at),
        )
        await db.commit()


async def mark_milestone_shown(key: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE milestones SET shown = 1 WHERE key = ?", (key,))
        await db.commit()



# ── Ledger (economy) ────────────────────────────────────────────────────────────

async def add_ledger(ts: str, delta: float, reason: str, meta: Optional[str] = None):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO ledger (ts, delta, reason, meta) VALUES (?, ?, ?, ?)",
            (ts, delta, reason, meta),
        )
        await db.commit()


async def ledger_sum() -> float:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT COALESCE(SUM(delta), 0) FROM ledger") as cursor:
            row = await cursor.fetchone()
            return float(row[0]) if row else 0.0


async def get_last_ts_for_reason(reason: str) -> Optional[str]:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT ts FROM ledger WHERE reason = ? ORDER BY ts DESC LIMIT 1",
            (reason,),
        ) as cursor:
            row = await cursor.fetchone()
            return row[0] if row else None


async def get_last_credit_ts() -> Optional[str]:
    return await get_last_ts_for_reason("checkin_credit")


async def has_ledger_reason_on_date(reason: str, date_str: str) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT 1 FROM ledger WHERE reason = ? AND date(ts) = ? LIMIT 1",
            (reason, date_str),
        ) as cursor:
            return await cursor.fetchone() is not None


async def get_ledger(limit: int = 100) -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM ledger ORDER BY ts DESC LIMIT ?", (limit,)
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


# ── Events ──────────────────────────────────────────────────────────────────────

async def add_event(key: str, label: str, multiplier: float, starts_at: str,
                    ends_at: str, created_at: str, meta: Optional[str] = None) -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO events (key, label, multiplier, starts_at, ends_at, created_at, meta)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (key, label, multiplier, starts_at, ends_at, created_at, meta),
        )
        await db.commit()
        return cursor.lastrowid


async def get_active_events(now_iso: str) -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM events WHERE starts_at <= ? AND ends_at > ? ORDER BY multiplier DESC",
            (now_iso, now_iso),
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def get_upcoming_events(now_iso: str, limit: int = 10) -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM events WHERE ends_at > ? ORDER BY starts_at LIMIT ?",
            (now_iso, limit),
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]



# ── Laptops (shopping board) ─────────────────────────────────────────────────

LAPTOP_FIELDS = ("model", "cpu", "passmark", "tdp_w", "ram_gb", "storage_gb",
                 "price_usd", "build", "display", "touch", "gpu", "url", "notes")


async def get_laptops() -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM laptops ORDER BY id") as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def add_laptop(data: dict, now: str) -> int:
    cols = [f for f in LAPTOP_FIELDS if f in data]
    placeholders = ", ".join("?" for _ in cols)
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            f"INSERT INTO laptops ({', '.join(cols)}, created_at, updated_at) "
            f"VALUES ({placeholders}, ?, ?)",
            [data[c] for c in cols] + [now, now],
        )
        await db.commit()
        return cursor.lastrowid


async def update_laptop(laptop_id: int, data: dict, now: str) -> bool:
    cols = [f for f in LAPTOP_FIELDS if f in data]
    if not cols:
        return False
    assignments = ", ".join(f"{c} = ?" for c in cols)
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            f"UPDATE laptops SET {assignments}, updated_at = ? WHERE id = ?",
            [data[c] for c in cols] + [now, laptop_id],
        )
        await db.commit()
        return cursor.rowcount > 0


async def delete_laptop(laptop_id: int) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("DELETE FROM laptops WHERE id = ?", (laptop_id,))
        await db.commit()
        return cursor.rowcount > 0


async def get_setting(key: str) -> Optional[str]:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT value FROM settings WHERE key = ?", (key,)) as cursor:
            row = await cursor.fetchone()
            return row[0] if row else None


async def set_setting(key: str, value: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value),
        )
        await db.commit()
