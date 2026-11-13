"""
sync_worker.py — Background thread that aggregates SQLite rows and pushes
                  minute-level summaries to Supabase via the scoped gateway.

Modeled on tunnel_sync.py's retry-with-backoff TunnelPublisher and
cloud_gateway.py's scoped-token gateway call.

Data flow
─────────
  SQLite (raw, every write)
      └─► SyncWorker.run()  [wakes every SYNC_INTERVAL_SECONDS]
              ├─► _aggregate_passenger_counts()  → 1 row  → gateway push
              └─► _aggregate_gps()               → N rows → gateway push

Aggregation rules
─────────────────
  passenger_counts:
    - Group unsynced rows by (trip_id, minute-bucket)
    - Emit { trip_id, bus_id, minute, avg_count, max_count, sample_count }
    - One Supabase row per trip per minute  (vs. 1 row every 5 s before)

  gps_locations:
    - Keep the most recent fix per 60-s window per trip
    - Emit { trip_id, latitude, longitude, altitude, speed, … }
    - Saves ~12× fewer GPS rows (was every 2 s, now every 60 s)

Security
────────
  Pi never holds the Supabase service-role key.
  All writes go through the scoped Supabase Edge Function (pi-gateway)
  which validates PI_TOKEN before touching any table.
"""

import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from cloud_gateway import gateway_request
from local_store import (
    fetch_unsynced_passenger_counts,
    fetch_unsynced_gps,
    mark_passenger_counts_synced,
    mark_gps_synced,
    write_sync_log,
    prune_old_rows,
    db_stats,
    init_db,
)

# ── Configuration ─────────────────────────────────────────────────────────────

SUPABASE_URL   = os.getenv("SUPABASE_URL", "").rstrip("/")
PI_TOKEN       = os.getenv("LPMAS_PI_TOKEN", os.getenv("PI_GATEWAY_TOKEN", ""))
GATEWAY_URL    = f"{SUPABASE_URL}/functions/v1/pi-gateway" if SUPABASE_URL else ""

SYNC_INTERVAL_SECONDS = int(os.getenv("SYNC_INTERVAL_SECONDS", "60"))   # run every 60 s
RETRY_BASE_SECONDS    = int(os.getenv("SYNC_RETRY_BASE", "10"))          # first retry after 10 s
RETRY_MAX_SECONDS     = int(os.getenv("SYNC_RETRY_MAX", "300"))          # cap at 5 min

TIMEZONE = ZoneInfo(os.getenv("LPMAS_TIMEZONE", "Asia/Manila"))


def _now_iso() -> str:
    return datetime.now(TIMEZONE).isoformat(timespec="seconds")


def _minute_bucket(unix_ts: float) -> str:
    """Floor a Unix timestamp to the minute, return ISO string."""
    dt = datetime.fromtimestamp(unix_ts, tz=TIMEZONE)
    return dt.replace(second=0, microsecond=0).isoformat(timespec="seconds")


# ── Aggregation helpers ───────────────────────────────────────────────────────

def _aggregate_passenger_counts(rows: list) -> tuple[list, list]:
    """
    Group raw passenger count rows into per-(trip_id, minute) aggregates.

    Returns
    -------
    aggregates : list of dicts ready to push to Supabase
    ids        : list of raw row IDs that were included (to mark synced)
    """
    # bucket → { trip_id, bus_id, counts:[], ids:[] }
    buckets: dict = {}
    ids = []

    for row in rows:
        trip_id    = row.get("trip_id") or "unknown"
        bus_id     = row.get("bus_id")
        bucket_key = f"{trip_id}::{_minute_bucket(row['recorded_at'])}"

        if bucket_key not in buckets:
            buckets[bucket_key] = {
                "trip_id":  trip_id,
                "bus_id":   bus_id,
                "minute":   _minute_bucket(row["recorded_at"]),
                "counts":   [],
                "ids":      [],
            }

        buckets[bucket_key]["counts"].append(row["count"])
        buckets[bucket_key]["ids"].append(row["id"])
        ids.append(row["id"])

    aggregates = []
    for b in buckets.values():
        counts = b["counts"]
        aggregates.append({
            "trip_id":      b["trip_id"],
            "bus_id":       b["bus_id"],
            "recorded_at":  b["minute"],          # Supabase recorded_at = minute bucket
            "count":        round(sum(counts) / len(counts)),   # average → integer
            "ai_count":     max(counts),          # max as the "peak" ai_count
            "source":       "yolo_pi_aggregate",
            "sample_count": len(counts),          # extra context for dashboard
        })

    return aggregates, ids


def _aggregate_gps(rows: list) -> tuple[list, list]:
    """
    Keep the most recent GPS fix per (trip_id, minute bucket).

    Returns
    -------
    aggregates : list of dicts ready to push to Supabase
    ids        : all raw row IDs included
    """
    # bucket → most recent row
    buckets: dict = {}
    ids = []

    for row in rows:
        trip_id    = row.get("trip_id") or "unknown"
        bucket_key = f"{trip_id}::{_minute_bucket(row['recorded_at'])}"

        # Keep the latest fix per bucket
        if (bucket_key not in buckets or
                row["recorded_at"] > buckets[bucket_key]["recorded_at"]):
            buckets[bucket_key] = row

        ids.append(row["id"])

    aggregates = []
    for row in buckets.values():
        aggregates.append({
            "trip_id":       row.get("trip_id"),
            "latitude":      row["latitude"],
            "longitude":     row["longitude"],
            "altitude":      row.get("altitude"),
            "speed":         row.get("speed"),
            "accuracy":      row.get("accuracy"),
            "source":        row.get("source", "gps"),
            "satellite_count": row.get("satellite_count"),
            "fix_quality":   row.get("fix_quality"),
            "recorded_at":   _minute_bucket(row["recorded_at"]),
        })

    return aggregates, ids


# ── Gateway push ──────────────────────────────────────────────────────────────

def _push(action: str, rows: list, table_name: str) -> bool:
    """
    Send aggregated rows to Supabase via the scoped gateway.
    Returns True on success.

    The Edge Function expects:
        { "action": "insert-batch", "table": "...", "rows": [...] }
    """
    if not rows:
        return True   # nothing to do — not a failure

    if not GATEWAY_URL or not PI_TOKEN:
        print(f"[SyncWorker] Gateway not configured — {len(rows)} {table_name} rows buffered locally")
        return False

    try:
        result = gateway_request(
            GATEWAY_URL, PI_TOKEN, action,
            table=table_name, rows=rows
        )
        print(f"[SyncWorker] ✓ Pushed {len(rows)} {table_name} rows — {result}")
        return True
    except Exception as exc:
        print(f"[SyncWorker] ✗ Push failed for {table_name}: {exc}")
        return False


# ── Core sync cycle ───────────────────────────────────────────────────────────

def _run_sync_cycle() -> bool:
    """
    Pull unsynced rows, aggregate, push, mark synced.
    Returns True if both pushes succeeded (or had nothing to push).
    """
    all_ok = True

    # ── Passenger counts ──────────────────────────────────────────────────────
    pc_rows = fetch_unsynced_passenger_counts(limit=1000)
    if pc_rows:
        aggregates, ids = _aggregate_passenger_counts(pc_rows)
        ok = _push("insert-batch", aggregates, "passenger_counts")
        if ok:
            mark_passenger_counts_synced(ids)
            write_sync_log("passenger_counts", len(aggregates))
            print(f"[SyncWorker] passenger_counts: {len(pc_rows)} raw → {len(aggregates)} aggregates")
        else:
            write_sync_log("passenger_counts", 0, status="error",
                           error="gateway push failed")
            all_ok = False
    else:
        print("[SyncWorker] passenger_counts: nothing pending")

    # ── GPS ───────────────────────────────────────────────────────────────────
    gps_rows = fetch_unsynced_gps(limit=1000)
    if gps_rows:
        aggregates, ids = _aggregate_gps(gps_rows)
        ok = _push("insert-batch", aggregates, "gps_locations")
        if ok:
            mark_gps_synced(ids)
            write_sync_log("gps_locations", len(aggregates))
            print(f"[SyncWorker] gps_locations: {len(gps_rows)} raw → {len(aggregates)} aggregates")
        else:
            write_sync_log("gps_locations", 0, status="error",
                           error="gateway push failed")
            all_ok = False
    else:
        print("[SyncWorker] gps_locations: nothing pending")

    # ── Housekeeping ──────────────────────────────────────────────────────────
    prune_old_rows()

    return all_ok


# ── Worker thread (mirrors TunnelPublisher pattern) ───────────────────────────

class SyncWorker:
    """
    Runs _run_sync_cycle() on a fixed interval with exponential-backoff retry.

    start() → spawns daemon thread, returns immediately
    stop()  → signals shutdown, joins thread
    status()→ dict with pending counts and last-sync time

    Mirrors the TunnelPublisher design from tunnel_sync.py:
      - condition variable so stop() wakes the sleeping thread instantly
      - retry delay resets on success, backs off on failure
      - all state is encapsulated, main process stays clean
    """

    def __init__(self, interval: int = SYNC_INTERVAL_SECONDS):
        self.interval     = interval
        self._condition   = threading.Condition()
        self._stopped     = False
        self._thread      = None
        self._attempts    = 0          # consecutive failures
        self._next_run    = time.monotonic()   # run immediately on first wake

    # ── lifecycle ─────────────────────────────────────────────────────────────

    def start(self):
        init_db()
        self._thread = threading.Thread(
            target=self._run, name="sqlite-sync-worker", daemon=True
        )
        self._thread.start()
        print(f"[SyncWorker] Started — interval={self.interval}s, gateway={GATEWAY_URL or 'NOT CONFIGURED'}")

    def stop(self):
        with self._condition:
            self._stopped = True
            self._condition.notify_all()
        if self._thread:
            self._thread.join(timeout=10)
        print("[SyncWorker] Stopped")

    def status(self) -> dict:
        stats = db_stats()
        stats["sync_interval_seconds"] = self.interval
        stats["consecutive_failures"]  = self._attempts
        stats["gateway_configured"]    = bool(GATEWAY_URL and PI_TOKEN)
        return stats

    # ── internal loop ─────────────────────────────────────────────────────────

    def _run(self):
        while True:
            with self._condition:
                if self._stopped:
                    return
                now   = time.monotonic()
                delay = max(0.0, self._next_run - now)
                if delay > 0:
                    self._condition.wait(timeout=delay)
                if self._stopped:
                    return

            # ── run one cycle ─────────────────────────────────────────────────
            try:
                success = _run_sync_cycle()
            except Exception as exc:
                print(f"[SyncWorker] Unhandled error in sync cycle: {exc}")
                success = False

            # ── schedule next run ─────────────────────────────────────────────
            with self._condition:
                if success:
                    self._attempts  = 0
                    self._next_run  = time.monotonic() + self.interval
                else:
                    self._attempts += 1
                    # exponential backoff: 10s, 20s, 40s … capped at RETRY_MAX
                    backoff = min(
                        RETRY_BASE_SECONDS * (2 ** (self._attempts - 1)),
                        RETRY_MAX_SECONDS
                    )
                    self._next_run = time.monotonic() + backoff
                    print(f"[SyncWorker] Retrying in {backoff}s (attempt {self._attempts})")


# ── Module-level singleton ────────────────────────────────────────────────────

_worker: SyncWorker = None


def get_worker() -> SyncWorker:
    """Return the module singleton, creating it if needed."""
    global _worker
    if _worker is None:
        _worker = SyncWorker()
    return _worker


def start_sync_worker():
    """Convenience: initialise and start the global worker. Call once at app startup."""
    get_worker().start()


def stop_sync_worker():
    """Convenience: stop the global worker. Call on app shutdown."""
    if _worker:
        _worker.stop()


def sync_status() -> dict:
    """Return current sync health for the /health endpoint."""
    if _worker:
        return _worker.status()
    return {"status": "not_started"}


# ── Standalone test ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("Running one manual sync cycle …")
    init_db()
    ok = _run_sync_cycle()
    print(f"Cycle result: {'OK' if ok else 'FAILED'}")
    print("DB stats:", db_stats())
