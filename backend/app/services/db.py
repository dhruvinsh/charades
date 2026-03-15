"""SQLite-backed persistence layer for tracking played movies and AI hints.

Stores play history with metadata so we can:
- Avoid repeating recently played movies across sessions
- Cache AI-generated hints alongside movie records
- Track statistics per session
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_DB_LOCK = threading.Lock()
_conn: sqlite3.Connection | None = None


def _db_path() -> str:
    env_path = os.environ.get("SQLITE_DB_PATH", "")
    if env_path:
        return env_path
    default = Path(__file__).resolve().parents[3] / "data" / "charades.db"
    default.parent.mkdir(parents=True, exist_ok=True)
    return str(default)


def get_connection() -> sqlite3.Connection:
    """Return a thread-local or shared SQLite connection (WAL mode, row factory)."""
    global _conn
    with _DB_LOCK:
        if _conn is None:
            path = _db_path()
            logger.info("Opening SQLite database at %s", path)
            _conn = sqlite3.connect(path, check_same_thread=False)
            _conn.row_factory = sqlite3.Row
            _conn.execute("PRAGMA journal_mode=WAL")
            _conn.execute("PRAGMA foreign_keys=ON")
            _conn.execute("PRAGMA synchronous=NORMAL")
            _init_schema(_conn)
        return _conn


def _init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS played_movies (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            movie_id    TEXT    NOT NULL,
            title       TEXT    NOT NULL,
            year        INTEGER,
            language    TEXT,
            difficulty  TEXT,
            source      TEXT,
            session_id  TEXT,
            action      TEXT    NOT NULL DEFAULT 'got_it',
            played_at   INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_played_movies_movie_id
            ON played_movies(movie_id);
        CREATE INDEX IF NOT EXISTS idx_played_movies_played_at
            ON played_movies(played_at);
        CREATE INDEX IF NOT EXISTS idx_played_movies_session_id
            ON played_movies(session_id);

        CREATE TABLE IF NOT EXISTS movie_hints (
            movie_id    TEXT    PRIMARY KEY,
            title       TEXT,
            hints_json  TEXT    NOT NULL,
            created_at  INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_movie_hints_created_at
            ON movie_hints(created_at);
        """
    )
    conn.commit()


def record_played_movie(
    movie_id: str,
    title: str,
    year: int | None,
    language: str | None,
    difficulty: str | None,
    source: str | None,
    session_id: str | None,
    action: str = "got_it",
    played_at: int | None = None,
) -> None:
    """Insert a played-movie record."""
    import time

    ts = played_at if played_at is not None else int(time.time() * 1000)
    conn = get_connection()
    with _DB_LOCK:
        conn.execute(
            """
            INSERT INTO played_movies
                (movie_id, title, year, language, difficulty, source, session_id, action, played_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (movie_id, title, year, language, difficulty, source, session_id, action, ts),
        )
        conn.commit()


def get_played_movie_ids(days_back: int = 30, actions: tuple[str, ...] = ("got_it",)) -> list[str]:
    """Return distinct movie IDs that were played (got_it by default) in the last N days."""
    import time

    cutoff = int((time.time() - days_back * 86400) * 1000)
    placeholders = ",".join("?" for _ in actions)
    conn = get_connection()
    rows = conn.execute(
        f"""
        SELECT DISTINCT movie_id FROM played_movies
        WHERE played_at >= ? AND action IN ({placeholders})
        """,
        (cutoff, *actions),
    ).fetchall()
    return [row["movie_id"] for row in rows]


def get_session_stats(session_id: str) -> dict[str, Any]:
    """Return play counts by action for a specific session."""
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT action, COUNT(*) as cnt FROM played_movies
        WHERE session_id = ? GROUP BY action
        """,
        (session_id,),
    ).fetchall()
    return {row["action"]: row["cnt"] for row in rows}


def save_movie_hints(movie_id: str, title: str, hints: dict[str, Any]) -> None:
    """Persist AI-generated hints for a movie so they can be reused without re-calling OpenAI."""
    import time

    conn = get_connection()
    with _DB_LOCK:
        conn.execute(
            """
            INSERT OR REPLACE INTO movie_hints (movie_id, title, hints_json, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (movie_id, title, json.dumps(hints), int(time.time() * 1000)),
        )
        conn.commit()


def get_cached_hints(movie_ids: list[str], ttl_hours: int = 168) -> dict[str, dict[str, Any]]:
    """Return cached hints for the given movie IDs (default TTL: 7 days)."""
    import time

    if not movie_ids:
        return {}
    cutoff = int((time.time() - ttl_hours * 3600) * 1000)
    placeholders = ",".join("?" for _ in movie_ids)
    conn = get_connection()
    rows = conn.execute(
        f"""
        SELECT movie_id, hints_json FROM movie_hints
        WHERE movie_id IN ({placeholders}) AND created_at >= ?
        """,
        (*movie_ids, cutoff),
    ).fetchall()
    result: dict[str, dict[str, Any]] = {}
    for row in rows:
        try:
            result[row["movie_id"]] = json.loads(row["hints_json"])
        except (json.JSONDecodeError, TypeError):
            pass
    return result


def prune_old_records(days_keep: int = 90) -> None:
    """Delete play history and hint records older than N days."""
    import time

    cutoff = int((time.time() - days_keep * 86400) * 1000)
    conn = get_connection()
    with _DB_LOCK:
        conn.execute("DELETE FROM played_movies WHERE played_at < ?", (cutoff,))
        conn.execute("DELETE FROM movie_hints WHERE created_at < ?", (cutoff,))
        conn.commit()
    logger.info("Pruned records older than %d days", days_keep)
