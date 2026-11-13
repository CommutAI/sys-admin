"""
local_store.py — SQLite write buffer for Pi sensor data.

Architecture:
    Sensor → ESP → Pi  →  SQLite (every raw reading)
                       →  sync_worker aggregates every minute
                       →  Supabase receives 1 row/min per data type

Why SQLite here:
  - Zero network calls on the hot path (every frame / GPS fix)
  - Pi keeps full raw history locally even when Supabase is unreachable
  - sync_worker reads & prunes old rows on its own schedule

Tables
------
passenger_counts_raw   raw count per 5-s DB save interval
gps_raw                every GPS fix logged by hardware_integration
sync_log               one row per successful Supabase push (audit trail)
"""

import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path

# ── Location of the SQLite file ───────────────────────────────────────────────
DB_PATH = Path(__file__).resolve().parent / "local_data.db"

# Keep at most this many days of raw rows before pruning
RAW_RETENTION_DAYS = int(3)   # 3 days of raw data, aggregates live in Supabase

# Thread-local connection so each thread gets its own handle
_local = threading.local()
_init_lock = threading.Lock()


# ── Schema ────────────────────────────────────────────────────────────────────

SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;

CREATE TABLE IF NOT EXISTS passenger_counts_raw (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id     TEXT,
    bus_id      TEXT,
    count       INTEGER NOT NULL,
    ai_count    INTEGER,
    source      TEXT    DEFAULT 'yolo_pi',
    recorded_at REAL    NOT NULL,   -- Unix timestamp (time.time())
    synced      INTEGER DEFAULT 0   -- 0=pending, 1=included in an aggregate push
);

CREATE TABLE IF NOT EXISTS gps_raw (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id         TEXT,
    latitude        REAL    NOT NULL,
    longitude       REAL    NOT NULL,
    altitude        REAL,
    speed           REAL,
    accuracy        REAL,
    source          TEXT    DEFAULT 'gps',
    satellite_count INTEGER,
    fix_quality     INTEGER,
    recorded_at     REAL    NOT NULL,
    synced          INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sync_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name  TEXT    NOT NULL,
    rows_synced INTEGER NOT NULL,
    pushed_at   REAL    NOT NULL,
    status      TEXT    DEFAULT 'ok',
    error       TEXT
);

CREATE INDEX IF NOT EXISTS idx_pc_synced     ON passenger_counts_raw(synced, recorded_at);
CREATE INDEX IF NOT EXISTS idx_gps_synced    ON gps_raw(synced, recorded_at);
CREATE INDEX IF NOT EXISTS idx_pc_trip       ON passenger_counts_raw(trip_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_gps_trip      ON gps_raw(trip_id, recorded_at);
"""


# ── Connection helpers ────────────────────────────────────────────────────────

def _get_conn() -> sqlite3.Connection:
    """Return (or create) a per-thread SQLite connection."""
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        _local.conn = conn
    return conn


@contextmanager
def _cursor():
    conn = _get_conn()
    cur = conn.cursor()
    try:
        yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()


def init_db():
    """Create all tables if they don't exist. Safe to call multiple times."""
    with _init_lock:
        with _cursor() as cur:
            cur.executescript(SCHEMA)
    print(f"[LocalStore] SQLite database ready at {DB_PATH}")


# ── Write helpers ─────────────────────────────────────────────────────────────

def write_passenger_count(count: int, trip_id: str = None, bus_id: str = None,
                          ai_count: int = None, source: str = "yolo_pi"):
    """
    Write one raw passenger count reading.
    Called from video_server_fastapi instead of supabase.table().insert().
    """
    with _cursor() as cur:
        cur.execute(
            """INSERT INTO passenger_counts_raw
               (trip_id, bus_id, count, ai_count, source, recorded_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (trip_id, bus_id, count, ai_count if ai_count is not None else count,
             source, time.time())
        )


def write_gps(latitude: float, longitude: float, trip_id: str = None,
              altitude: float = None, speed: float = None, accuracy: float = None,
              source: str = "gps", satellite_count: int = None, fix_quality: int = None):
    """
    Write one raw GPS fix.
    Called from hardware_integration instead of supabase.table().insert().
    """
    with _cursor() as cur:
        cur.execute(
            """INSERT INTO gps_raw
               (trip_id, latitude, longitude, altitude, speed, accuracy,
                source, satellite_count, fix_quality, recorded_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (trip_id, latitude, longitude, altitude, speed, accuracy,
             source, satellite_count, fix_quality, time.time())
        )


# ── Read helpers for sync_worker ─────────────────────────────────────────────

def fetch_unsynced_passenger_counts(limit: int = 500):
    """Return up to `limit` raw passenger count rows not yet included in an aggregate."""
    with _cursor() as cur:
        cur.execute(
            """SELECT * FROM passenger_counts_raw
               WHERE synced = 0
               ORDER BY recorded_at ASC
               LIMIT ?""",
            (limit,)
        )
        return [dict(row) for row in cur.fetchall()]


def fetch_unsynced_gps(limit: int = 500):
    """Return up to `limit` raw GPS rows not yet synced."""
    with _cursor() as cur:
        cur.execute(
            """SELECT * FROM gps_raw
               WHERE synced = 0
               ORDER BY recorded_at ASC
               LIMIT ?""",
            (limit,)
        )
        return [dict(row) for row in cur.fetchall()]


def mark_passenger_counts_synced(ids: list):
    """Mark rows as included in an aggregate push."""
    if not ids:
        return
    placeholders = ",".join("?" * len(ids))
    with _cursor() as cur:
        cur.execute(
            f"UPDATE passenger_counts_raw SET synced=1 WHERE id IN ({placeholders})",
            ids
        )


def mark_gps_synced(ids: list):
    if not ids:
        return
    placeholders = ",".join("?" * len(ids))
    with _cursor() as cur:
        cur.execute(
            f"UPDATE gps_raw SET synced=1 WHERE id IN ({placeholders})",
            ids
        )


def write_sync_log(table_name: str, rows_synced: int,
                   status: str = "ok", error: str = None):
    with _cursor() as cur:
        cur.execute(
            """INSERT INTO sync_log (table_name, rows_synced, pushed_at, status, error)
               VALUES (?, ?, ?, ?, ?)""",
            (table_name, rows_synced, time.time(), status, error)
        )


# ── Maintenance ───────────────────────────────────────────────────────────────

def prune_old_rows():
    """Delete synced rows older than RAW_RETENTION_DAYS to keep the DB small."""
    cutoff = time.time() - RAW_RETENTION_DAYS * 86_400
    with _cursor() as cur:
        cur.execute(
            "DELETE FROM passenger_counts_raw WHERE synced=1 AND recorded_at < ?",
            (cutoff,)
        )
        pc_deleted = cur.rowcount
        cur.execute(
            "DELETE FROM gps_raw WHERE synced=1 AND recorded_at < ?",
            (cutoff,)
        )
        gps_deleted = cur.rowcount
    if pc_deleted or gps_deleted:
        print(f"[LocalStore] Pruned {pc_deleted} passenger rows, {gps_deleted} GPS rows")


def db_stats() -> dict:
    """Return row counts for health checks."""
    with _cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM passenger_counts_raw WHERE synced=0")
        pc_pending = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM gps_raw WHERE synced=0")
        gps_pending = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM sync_log ORDER BY pushed_at DESC LIMIT 1")
        last_sync = cur.fetchone()
    return {
        "passenger_pending": pc_pending,
        "gps_pending": gps_pending,
        "last_sync_at": last_sync[0] if last_sync else None,
        "db_path": str(DB_PATH),
    }
