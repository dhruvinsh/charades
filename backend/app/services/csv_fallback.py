"""CSV fallback service — loads movies from movies.csv."""

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


def load_movies() -> list[dict[str, Any]]:
    """Load all movies from CSV and return as list of dicts."""
    movies: list[dict[str, Any]] = []
    try:
        with _CSV_PATH.open(newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                year_raw = row.get("MOVIE_RELEASE_YEAR", "").strip()
                year: int | None = int(year_raw) if year_raw.isdigit() else None
                movies.append(
                    {
                        "id": row.get("MOVIE_ID", "").strip(),
                        "title": row.get("MOVIE_TITLE", "").strip(),
                        "year": year,
                        "language": "hi",
                        "original_language": "hi",
                        "popularity": 50.0,  # neutral score for CSV movies
                        "poster_path": None,
                        "source": "csv",
                        "era": _era_from_year(year),
                    }
                )
    except FileNotFoundError:
        logger.error("CSV file not found at %s", _CSV_PATH)
    except Exception as exc:
        logger.exception("Failed to load CSV: %s", exc)

    logger.info("Loaded %d movies from CSV fallback", len(movies))
    return movies
