"""Flask application factory."""

from __future__ import annotations

import logging
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, Response, send_from_directory
from flask_cors import CORS

from app.config import Config
from app.routes.health import health_bp
from app.routes.movies import movies_bp

load_dotenv()

# Path to the Vite build output (frontend/dist)
_FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


def create_app(config: Config | None = None) -> Flask:
    """Create and configure the Flask application."""
    cfg = config or Config()

    logging.basicConfig(
        level=logging.DEBUG if cfg.DEBUG else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    )

    app = Flask(__name__, static_folder=None)

    # Apply config
    app.secret_key = cfg.SECRET_KEY
    app.config["TMDB_API_KEY"] = cfg.TMDB_API_KEY
    app.config["TMDB_BASE_URL"] = cfg.TMDB_BASE_URL
    app.config["TMDB_IMAGE_BASE_URL"] = cfg.TMDB_IMAGE_BASE_URL
    app.config["TMDB_LANGUAGES"] = cfg.TMDB_LANGUAGES
    app.config["TMDB_PAGES_PER_BATCH"] = cfg.TMDB_PAGES_PER_BATCH
    app.config["OPENAI_API_KEY"] = cfg.OPENAI_API_KEY
    app.config["OPENAI_MODEL"] = cfg.OPENAI_MODEL
    app.config["DEBUG"] = cfg.DEBUG

    # CORS — allow Vite dev server in development
    CORS(
        app,
        resources={r"/api/*": {"origins": cfg.CORS_ORIGINS.split(",")}},
    )

    # Register blueprints
    app.register_blueprint(health_bp)
    app.register_blueprint(movies_bp)

    # Serve the Vite SPA (production)
    if _FRONTEND_DIST.exists():

        @app.route("/", defaults={"path": ""})
        @app.route("/<path:path>")
        def serve_spa(path: str) -> Response:
            file_path = _FRONTEND_DIST / path
            if path and file_path.exists():
                return send_from_directory(str(_FRONTEND_DIST), path)
            # Fall back to index.html for client-side routing
            return send_from_directory(str(_FRONTEND_DIST), "index.html")

    return app
