"""Application configuration from environment variables."""

from __future__ import annotations

import os
import secrets
from dataclasses import dataclass, field


@dataclass
class Config:
    """Base configuration."""

    SECRET_KEY: str = field(
        default_factory=lambda: os.environ.get("SECRET_KEY", secrets.token_hex(32))
    )
    TMDB_API_KEY: str = field(default_factory=lambda: os.environ.get("TMDB_API_KEY", ""))
    TMDB_BASE_URL: str = "https://api.themoviedb.org/3"
    TMDB_IMAGE_BASE_URL: str = "https://image.tmdb.org/t/p"
    # Languages: hi=Hindi, ta=Tamil, te=Telugu, ml=Malayalam
    TMDB_LANGUAGES: str = field(
        default_factory=lambda: os.environ.get("TMDB_LANGUAGES", "hi|ta|te|ml")
    )
    # Max pages per TMDB batch fetch (each page = 20 movies)
    TMDB_PAGES_PER_BATCH: int = field(
        default_factory=lambda: int(os.environ.get("TMDB_PAGES_PER_BATCH", "5"))
    )
    FLASK_ENV: str = field(default_factory=lambda: os.environ.get("FLASK_ENV", "production"))
    CORS_ORIGINS: str = field(
        default_factory=lambda: os.environ.get("CORS_ORIGINS", "http://localhost:5173")
    )

    @property
    def DEBUG(self) -> bool:  # noqa: N802
        return self.FLASK_ENV == "development"

    @property
    def tmdb_enabled(self) -> bool:
        return bool(self.TMDB_API_KEY)
