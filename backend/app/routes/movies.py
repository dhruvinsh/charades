"""Movies API routes — TMDB proxy with CSV fallback."""

from __future__ import annotations

import logging
import random
from typing import Any

from flask import Blueprint, current_app, jsonify, request

from app.services.csv_fallback import find_movie_by_title, load_movies
from app.services.openai_engine import generate_movie_batch
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


@movies_bp.post("/movies/ai-generate")
def ai_generate() -> tuple:  # type: ignore[type-arg]
    """
    AI game engine: OpenAI generates movie batch; TMDB or CSV validates.
    Body: { model?, difficulty, era, language, batch_size? }
    Headers: X-OpenAI-Key (optional, overrides env), X-TMDB-Key (optional, overrides env)
    """
    openai_key: str = request.headers.get("X-OpenAI-Key", "").strip() or current_app.config.get(
        "OPENAI_API_KEY", ""
    )
    if not openai_key:
        return jsonify({"error": "OpenAI API key required"}), 400

    tmdb_key: str = request.headers.get("X-TMDB-Key", "").strip() or current_app.config.get(
        "TMDB_API_KEY", ""
    )

    body = request.get_json(silent=True) or {}
    model = (body.get("model") or current_app.config.get("OPENAI_MODEL", "gpt-4.1-mini")).strip()
    difficulty = (body.get("difficulty") or "medium").strip()
    era = (body.get("era") or "all").strip()
    language = (body.get("language") or "all").strip()
    try:
        batch_size = min(int(body.get("batch_size", 15)), 25)
    except (TypeError, ValueError):
        batch_size = 15
    if difficulty not in ("easy", "medium", "hard"):
        difficulty = "medium"
    if era not in ("all", "90s", "2000s", "2010s", "2020s"):
        era = "all"
    lang_param = "hindi" if language == "hindi" else "all"

    try:
        suggestions, token_usage = generate_movie_batch(
            api_key=openai_key,
            model=model,
            difficulty=difficulty,
            era=era,
            language=lang_param,
            batch_size=batch_size,
        )
    except Exception as exc:
        logger.warning("OpenAI generate_movie_batch failed: %s", exc)
        return jsonify({"error": "AI generation failed"}), 502

    validated: list[dict[str, Any]] = []
    if tmdb_key:
        client = TMDBClient(
            api_key=tmdb_key,
            base_url=current_app.config.get("TMDB_BASE_URL", "https://api.themoviedb.org/3"),
        )
        try:
            for s in suggestions:
                movie = client.search_movie(s["title"], s.get("year"))
                if movie:
                    movie["source"] = "ai"
                    movie["ai_hints"] = s.get("hints") or {}
                    validated.append(movie)
        except Exception as exc:
            logger.warning("TMDB validation during AI generate failed: %s", exc)
        finally:
            client.close()
    else:
        csv_movies = _get_csv_movies()
        for s in suggestions:
            movie = find_movie_by_title(csv_movies, s["title"], s.get("year"))
            if movie:
                movie = dict(movie)
                movie["source"] = "ai"
                movie["ai_hints"] = s.get("hints") or {}
                validated.append(movie)

    # If we got too few, still return what we have (frontend can fall back to GET /movies)
    return jsonify({
        "movies": validated,
        "source": "ai",
        "total": len(validated),
        "token_usage": token_usage,
    }), 200
