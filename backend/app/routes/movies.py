"""Movies API routes — TMDB proxy with CSV fallback and AI engine integration."""

from __future__ import annotations

import logging
import random
from typing import Any

from flask import Blueprint, current_app, jsonify, request

from app.services.csv_fallback import find_movie_by_title, load_movies
from app.services.db import (
    get_cached_hints,
    get_played_movie_ids,
    save_movie_hints,
)
from app.services.openai_engine import generate_hints_for_movies, generate_movie_batch
from app.services.tmdb import TMDBClient, apply_difficulty_filter

logger = logging.getLogger(__name__)
movies_bp = Blueprint("movies", __name__, url_prefix="/api")

# Module-level CSV cache (loaded once at startup per worker process)
_csv_movies: list[dict[str, Any]] | None = None


def _get_csv_movies() -> list[dict[str, Any]]:
    global _csv_movies
    if _csv_movies is None:
        _csv_movies = load_movies()
    return _csv_movies


def _get_tmdb_client() -> TMDBClient | None:
    api_key: str = request.headers.get("X-TMDB-Key", "").strip() or current_app.config.get(
        "TMDB_API_KEY", ""
    )
    if not api_key:
        return None
    return TMDBClient(
        api_key=api_key,
        base_url=current_app.config.get("TMDB_BASE_URL", "https://api.themoviedb.org/3"),
    )


def _era_to_date_range(era: str) -> dict[str, str]:
    """Convert era label to TMDB date-range query params."""
    ranges: dict[str, tuple[str, str]] = {
        "90s": ("1990-01-01", "1999-12-31"),
        "2000s": ("2000-01-01", "2009-12-31"),
        "2010s": ("2010-01-01", "2019-12-31"),
        "2020s": ("2020-01-01", "2029-12-31"),
    }
    if era in ranges:
        gte, lte = ranges[era]
        return {
            "primary_release_date.gte": gte,
            "primary_release_date.lte": lte,
        }
    return {}


@movies_bp.get("/movies")
def get_movies() -> tuple:  # type: ignore[type-arg]
    """
    Fetch a batch of movies (TMDB or CSV fallback).
    Query params:
      - hindi_only (bool, default false)
      - pages (int, default 5, max 10)
      - sort_by (str, default popularity.desc)
      - source (str: 'tmdb' | 'csv' | 'auto', default 'auto')
      - era (str: 'all' | '90s' | '2000s' | '2010s' | '2020s', default 'all')
      - difficulty (str: 'easy' | 'medium' | 'hard', default 'medium')
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
    era = request.args.get("era", "all")

    movies: list[dict[str, Any]] = []
    source_used = "csv"

    if source_param != "csv":
        client = _get_tmdb_client()
        if client:
            try:
                langs: str = current_app.config.get("TMDB_LANGUAGES", "hi|ta|te|ml")
                extra_params = _era_to_date_range(era)
                movies = client.fetch_movies_batch(
                    languages=langs,
                    pages=pages,
                    hindi_only=hindi_only,
                    sort_by=sort_by,
                    extra_params=extra_params if extra_params else None,
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
    AI game engine. Two internal strategies depending on available keys:

    AI+TMDB (preferred):
      1. Fetch a TMDB discover batch (1 API call) — no individual title searches.
      2. Filter by difficulty, era, language; exclude already-played movies.
      3. Generate AI hints for the selected batch (1 OpenAI call).
      → Total: 1 TMDB call + 1 OpenAI call (instead of 1 OpenAI + N TMDB searches).

    AI-only (no TMDB key):
      1. OpenAI generates movie titles + hints.
      2. Validate titles against the local CSV (no external API calls).

    Body: { model?, difficulty, era, language, batch_size?, exclude_ids? }
    Headers: X-OpenAI-Key (optional), X-TMDB-Key (optional)
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

    # IDs of movies the client already played — exclude from returned batch
    client_exclude_ids: set[str] = set(body.get("exclude_ids") or [])

    if difficulty not in ("easy", "medium", "hard"):
        difficulty = "medium"
    if era not in ("all", "90s", "2000s", "2010s", "2020s"):
        era = "all"
    lang_param = "hindi" if language in ("hindi", "hi") else "all"
    hindi_only = lang_param == "hindi"

    # ------------------------------------------------------------------
    # Strategy A: AI + TMDB — batch discover + AI hints
    # ------------------------------------------------------------------
    if tmdb_key:
        return _ai_with_tmdb(
            openai_key=openai_key,
            tmdb_key=tmdb_key,
            model=model,
            difficulty=difficulty,
            era=era,
            hindi_only=hindi_only,
            batch_size=batch_size,
            client_exclude_ids=client_exclude_ids,
        )

    # ------------------------------------------------------------------
    # Strategy B: AI-only — OpenAI generates titles, CSV validates
    # ------------------------------------------------------------------
    return _ai_only(
        openai_key=openai_key,
        model=model,
        difficulty=difficulty,
        era=era,
        language=lang_param,
        batch_size=batch_size,
    )


def _ai_with_tmdb(
    openai_key: str,
    tmdb_key: str,
    model: str,
    difficulty: str,
    era: str,
    hindi_only: bool,
    batch_size: int,
    client_exclude_ids: set[str],
) -> tuple:  # type: ignore[type-arg]
    """
    Efficient AI+TMDB flow:
    1. Single TMDB discover batch (3-5 pages).
    2. Apply difficulty / era / language filters.
    3. Exclude already-played movies (client-supplied + server SQLite history).
    4. Single OpenAI call to generate hints for the selected batch.
    """
    langs: str = current_app.config.get("TMDB_LANGUAGES", "hi|ta|te|ml")
    extra_params = _era_to_date_range(era)

    client = TMDBClient(
        api_key=tmdb_key,
        base_url=current_app.config.get("TMDB_BASE_URL", "https://api.themoviedb.org/3"),
    )
    try:
        all_movies = client.fetch_movies_batch(
            languages=langs,
            pages=5,
            hindi_only=hindi_only,
            sort_by="popularity.desc",
            extra_params=extra_params if extra_params else None,
        )
    except Exception as exc:
        client.close()
        logger.warning("TMDB batch fetch failed in AI+TMDB mode: %s", exc)
        return jsonify({"error": "TMDB fetch failed"}), 502
    finally:
        client.close()

    if not all_movies:
        return jsonify({"error": "TMDB returned no movies"}), 502

    # Filter by difficulty using multi-factor scoring
    filtered = apply_difficulty_filter(all_movies, difficulty)
    if len(filtered) < 10:
        filtered = all_movies  # safety: relax filter if too narrow

    # Exclude already-played movies from SQLite (got_it only, 30-day window)
    server_played_ids = set(get_played_movie_ids(days_back=30, actions=("got_it",)))
    all_exclude = client_exclude_ids | server_played_ids

    available = [m for m in filtered if str(m.get("id", "")) not in all_exclude]

    # If too few after exclusion, also allow movies that were only skipped/timed-out
    if len(available) < batch_size:
        logger.info(
            "Only %d unplayed movies after exclusion; relaxing to skip/timeout exclusions",
            len(available),
        )
        skip_played_ids = set(get_played_movie_ids(days_back=7, actions=("got_it", "skipped", "timeout")))
        available = [m for m in filtered if str(m.get("id", "")) not in skip_played_ids]

    # If still too few, use everything (full repetition is acceptable)
    if len(available) < batch_size:
        logger.info("Using full filtered list (%d movies) — all recently played", len(filtered))
        available = filtered

    # Select the batch
    random.shuffle(available)
    batch = available[:batch_size]

    # Check SQLite hint cache — avoid calling OpenAI if hints are cached
    batch_ids = [str(m.get("id", "")) for m in batch]
    cached_hints = get_cached_hints(batch_ids, ttl_hours=168)  # 7-day hint cache

    movies_needing_hints = [m for m in batch if str(m.get("id", "")) not in cached_hints]
    total_usage: dict[str, Any] = {"prompt_tokens": 0, "completion_tokens": 0, "model": model}

    if movies_needing_hints:
        try:
            new_hints, token_usage = generate_hints_for_movies(
                api_key=openai_key,
                model=model,
                movies=movies_needing_hints,
            )
            total_usage["prompt_tokens"] = token_usage.get("prompt_tokens", 0)
            total_usage["completion_tokens"] = token_usage.get("completion_tokens", 0)
            total_usage["model"] = token_usage.get("model", model)

            # Persist new hints to SQLite for reuse
            for m in movies_needing_hints:
                title = m.get("title", "")
                hints = new_hints.get(title, {})
                if hints:
                    save_movie_hints(str(m.get("id", "")), title, hints)
            cached_hints.update(
                {str(m.get("id", "")): new_hints.get(m.get("title", ""), {})
                 for m in movies_needing_hints}
            )
        except Exception as exc:
            logger.warning("OpenAI hints generation failed: %s — returning without hints", exc)

    # Attach hints and mark source
    result: list[dict[str, Any]] = []
    for m in batch:
        movie = dict(m)
        movie["source"] = "ai"
        movie["ai_hints"] = cached_hints.get(str(m.get("id", "")), {})
        result.append(movie)

    logger.info(
        "AI+TMDB: returning %d movies (hints cached=%d, new=%d)",
        len(result),
        len(batch) - len(movies_needing_hints),
        len(movies_needing_hints),
    )

    return jsonify(
        {
            "movies": result,
            "source": "ai",
            "total": len(result),
            "token_usage": total_usage,
        }
    ), 200


def _ai_only(
    openai_key: str,
    model: str,
    difficulty: str,
    era: str,
    language: str,
    batch_size: int,
) -> tuple:  # type: ignore[type-arg]
    """
    AI-only flow (no TMDB): OpenAI generates movie titles + hints,
    then each title is validated against the local CSV (no extra API calls).
    """
    try:
        suggestions, token_usage = generate_movie_batch(
            api_key=openai_key,
            model=model,
            difficulty=difficulty,
            era=era,
            language=language,
            batch_size=batch_size,
        )
    except Exception as exc:
        logger.warning("OpenAI generate_movie_batch failed: %s", exc)
        return jsonify({"error": "AI generation failed"}), 502

    csv_movies = _get_csv_movies()
    validated: list[dict[str, Any]] = []
    for s in suggestions:
        movie = find_movie_by_title(csv_movies, s["title"], s.get("year"))
        if movie:
            movie = dict(movie)
            movie["source"] = "ai"
            movie["ai_hints"] = s.get("hints") or {}
            validated.append(movie)

    logger.info("AI-only: %d/%d suggestions validated against CSV", len(validated), len(suggestions))
    return jsonify(
        {
            "movies": validated,
            "source": "ai",
            "total": len(validated),
            "token_usage": token_usage,
        }
    ), 200
