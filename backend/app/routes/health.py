"""Health check route."""

from __future__ import annotations

from flask import Blueprint, current_app, jsonify

health_bp = Blueprint("health", __name__)


@health_bp.get("/health")
def health() -> tuple:  # type: ignore[type-arg]
    payload: dict = {"status": "ok"}
    openai_key = (current_app.config.get("OPENAI_API_KEY") or "").strip()
    payload["openai_configured"] = bool(openai_key)
    if openai_key:
        payload["openai_model"] = (current_app.config.get("OPENAI_MODEL") or "gpt-4.1-mini").strip()
    return jsonify(payload), 200
