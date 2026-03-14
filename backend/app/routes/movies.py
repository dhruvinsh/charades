"""Movies API routes — TMDB proxy with CSV fallback."""

from __future__ import annotations

import logging
import random
from typing import Any

from flask import Blueprint, current_app, jsonify, request

from app.services.csv_fallback import load_movies
from app.services.tmdb import TMDBClient

logger = logging.getLogger(__name__)
movies_bp = Blueprint("movies", __name__, url_prefix="/api")

# Module-level CSV cache (loaded once at startup)
_csv_movies: list[dict[str, Any]] | None = None


def _get_csv_movies() -> list[dict[str, Any]]:
    global _csv_movies
    if _csv_movies is None:
        _csv_movies = load_movies()
    return _csv_movies


def _get_tmdb_client() -> TMDBClient | None:
    # Prefer key supplied by the browser via header (user-configured in UI),
    # fall back to the server-side env key.
    api_key: str = request.headers.get("X-TMDB-Key", "").strip() or current_app.config.get(
        "TMDB_API_KEY", ""
    )
    if not api_key:
        return None
    return TMDBClient(
        api_key=api_key,
        base_url=current_app.config.get("TMDB_BASE_URL", "https://api.themoviedb.org/3"),
    )


@movies_bp.get("/movies")
def get_movies() -> tuple:  # type: ignore[type-arg]
    """
    Fetch a batch of movies. Query params:
      - hindi_only (bool, default false)
      - pages (int, default 5, max 10)
      - sort_by (str, default popularity.desc)
      - source (str: 'tmdb' | 'csv' | 'auto', default 'auto')
    Returns JSON: { movies: [...], source: 'tmdb'|'csv', total: int }
    """
    hindi_only_raw = request.args.get("hindi_only", "false").lower()
    hindi_only = hindi_only_raw in ("1", "true", "yes")

    try:
        pages = min(int(request.args.get("pages", "5")), 10)
    except ValueError:
        pages = 5

    sort_by = request.args.get("sort_by", "popularity.desc")
    source_param = request.args.get("source", "auto")

    movies: list[dict[str, Any]] = []
    source_used = "csv"

    if source_param != "csv":
        client = _get_tmdb_client()
        if client:
            try:
                langs: str = current_app.config.get("TMDB_LANGUAGES", "hi|ta|te|ml")
                movies = client.fetch_movies_batch(
                    languages=langs,
                    pages=pages,
                    hindi_only=hindi_only,
                    sort_by=sort_by,
                )
                client.close()
                source_used = "tmdb"
            except Exception as exc:
                logger.warning("TMDB fetch failed, falling back to CSV: %s", exc)
                movies = []

    if not movies:
        movies = _get_csv_movies()
        source_used = "csv"
        if hindi_only:
            movies = [m for m in movies if m.get("language") == "hi"]

    # Shuffle for randomness
    shuffled = movies.copy()
    random.shuffle(shuffled)

    return jsonify({"movies": shuffled, "source": source_used, "total": len(shuffled)}), 200


@movies_bp.get("/movies/random")
def get_random_movie() -> tuple:  # type: ignore[type-arg]
    """Return a single random movie. Same filter params as /api/movies."""
    hindi_only_raw = request.args.get("hindi_only", "false").lower()
    hindi_only = hindi_only_raw in ("1", "true", "yes")
    source_param = request.args.get("source", "auto")

    movies: list[dict[str, Any]] = []
    source_used = "csv"

    if source_param != "csv":
        client = _get_tmdb_client()
        if client:
            try:
                langs: str = current_app.config.get("TMDB_LANGUAGES", "hi|ta|te|ml")
                movies = client.fetch_movies_batch(
                    languages=langs,
                    pages=2,
                    hindi_only=hindi_only,
                )
                client.close()
                source_used = "tmdb"
            except Exception as exc:
                logger.warning("TMDB fetch failed, falling back to CSV: %s", exc)
                movies = []

    if not movies:
        movies = _get_csv_movies()
        source_used = "csv"
        if hindi_only:
            movies = [m for m in movies if m.get("language") == "hi"]

    if not movies:
        return jsonify({"error": "No movies available"}), 503

    movie = random.choice(movies)
    return jsonify({"movie": movie, "source": source_used}), 200
