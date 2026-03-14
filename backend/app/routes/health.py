"""Health check route."""

from __future__ import annotations

from flask import Blueprint, jsonify

health_bp = Blueprint("health", __name__)


@health_bp.get("/health")
def health() -> tuple:  # type: ignore[type-arg]
    return jsonify({"status": "ok"}), 200
