"""CSV fallback service — loads movies from movies.csv (supports enriched columns)."""

from __future__ import annotations

import csv
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Resolve CSV path relative to this file (backend/app/services/ -> project root)
_CSV_PATH = Path(__file__).resolve().parents[3] / "movies.csv"


def _era_from_year(year: int | None) -> str:
    if year is None:
        return "unknown"
    if year < 2000:
        return "90s"
    if year < 2010:
        return "2000s"
    if year < 2020:
        return "2010s"
    return "2020s"


def _parse_row(row: dict[str, str]) -> dict[str, Any]:
    """Parse a CSV row into internal movie dict (supports enriched and legacy columns)."""
    year_raw = row.get("MOVIE_RELEASE_YEAR", "").strip()
    year: int | None = int(year_raw) if year_raw.isdigit() else None
    # Enriched columns (backward-compat: use defaults if missing)
    pop_raw = row.get("POPULARITY", "").strip()
    popularity = float(pop_raw) if pop_raw and pop_raw.replace(".", "").isdigit() else 50.0
    poster = row.get("POSTER_PATH", "").strip() or None
    if poster and not poster.startswith("/"):
        poster = "/" + poster
    lang = (row.get("ORIGINAL_LANGUAGE", "") or "hi").strip() or "hi"
    difficulty = (row.get("DIFFICULTY", "") or "medium").strip() or "medium"
    if difficulty not in ("easy", "medium", "hard"):
        difficulty = "medium"
    tmdb_id_raw = row.get("TMDB_ID", "").strip()
    tmdb_id = int(tmdb_id_raw) if tmdb_id_raw.isdigit() else None
    return {
        "id": row.get("MOVIE_ID", "").strip() or str(tmdb_id) if tmdb_id else "",
        "title": row.get("MOVIE_TITLE", "").strip(),
        "year": year,
        "language": lang,
        "original_language": lang,
        "popularity": popularity,
        "poster_path": poster,
        "source": "csv",
        "era": _era_from_year(year),
        "difficulty": difficulty,
        "tmdb_id": tmdb_id,
    }


def load_movies() -> list[dict[str, Any]]:
    """Load all movies from CSV and return as list of dicts (supports enriched format)."""
    movies: list[dict[str, Any]] = []
    try:
        with _CSV_PATH.open(newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if not row.get("MOVIE_TITLE", "").strip():
                    continue
                movies.append(_parse_row(row))
    except FileNotFoundError:
        logger.error("CSV file not found at %s", _CSV_PATH)
    except Exception as exc:
        logger.exception("Failed to load CSV: %s", exc)

    logger.info("Loaded %d movies from CSV fallback", len(movies))
    return movies


def find_movie_by_title(
    movies: list[dict[str, Any]], title: str, year: int | None = None
) -> dict[str, Any] | None:
    """
    Find a movie in the list by title (case-insensitive exact, then substring).
    Optional year filter: if provided, prefer a match with same year.
    """
    if not title or not movies:
        return None
    title_clean = title.strip()
    title_lower = title_clean.lower()
    exact: dict[str, Any] | None = None
    substring: dict[str, Any] | None = None
    for m in movies:
        t = (m.get("title") or "").strip()
        if not t:
            continue
        if t.lower() == title_lower:
            if year is not None and m.get("year") == year:
                return m
            if exact is None:
                exact = m
        elif title_lower in t.lower() or t.lower() in title_lower:
            if year is not None and m.get("year") == year:
                return m
            if substring is None:
                substring = m
    return exact or substring
