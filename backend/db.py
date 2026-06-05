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
"""


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(CREATE_TABLES)
        await db.commit()


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
