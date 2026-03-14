"""Play-history API — records played movies in SQLite and returns dedup lists."""

from __future__ import annotations

import logging

from flask import Blueprint, jsonify, request

from app.services.db import (
    get_played_movie_ids,
    get_session_stats,
    prune_old_records,
    record_played_movie,
)

logger = logging.getLogger(__name__)
history_bp = Blueprint("history", __name__, url_prefix="/api/history")


@history_bp.post("/record")
def record_played() -> tuple:  # type: ignore[type-arg]
    """
    Record a movie as played.
    Body: { movie_id, title, year?, language?, difficulty?, source?, session_id?, action? }
    action: 'got_it' | 'skipped' | 'timeout'  (default 'got_it')
    """
    body = request.get_json(silent=True) or {}
    movie_id = (body.get("movie_id") or "").strip()
    title = (body.get("title") or "").strip()
    if not movie_id or not title:
        return jsonify({"error": "movie_id and title are required"}), 400

    action = body.get("action", "got_it")
    if action not in ("got_it", "skipped", "timeout"):
        action = "got_it"

    try:
        record_played_movie(
            movie_id=movie_id,
            title=title,
            year=body.get("year"),
            language=body.get("language"),
            difficulty=body.get("difficulty"),
            source=body.get("source"),
            session_id=body.get("session_id"),
            action=action,
            played_at=body.get("played_at"),
        )
        return jsonify({"ok": True}), 201
    except Exception as exc:
        logger.warning("Failed to record played movie: %s", exc)
        return jsonify({"error": "Failed to record"}), 500


@history_bp.get("/played-ids")
def played_ids() -> tuple:  # type: ignore[type-arg]
    """
    Return distinct movie IDs played recently.
    Query params:
      - days_back (int, default 30)
      - actions (comma-separated, default 'got_it')
    """
    try:
        days_back = max(1, min(int(request.args.get("days_back", "30")), 365))
    except ValueError:
        days_back = 30

    raw_actions = request.args.get("actions", "got_it")
    actions = tuple(
        a.strip() for a in raw_actions.split(",") if a.strip() in ("got_it", "skipped", "timeout")
    ) or ("got_it",)

    ids = get_played_movie_ids(days_back=days_back, actions=actions)
    return jsonify({"ids": ids, "total": len(ids)}), 200


@history_bp.get("/session/<session_id>")
def session_stats(session_id: str) -> tuple:  # type: ignore[type-arg]
    """Return per-action counts for a session."""
    stats = get_session_stats(session_id)
    return jsonify({"session_id": session_id, "stats": stats}), 200


@history_bp.post("/prune")
def prune() -> tuple:  # type: ignore[type-arg]
    """Prune records older than days_keep (default 90). For maintenance."""
    body = request.get_json(silent=True) or {}
    try:
        days_keep = max(7, int(body.get("days_keep", 90)))
    except (TypeError, ValueError):
        days_keep = 90
    prune_old_records(days_keep=days_keep)
    return jsonify({"ok": True}), 200
