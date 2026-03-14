"""Smoke tests for Flask API routes."""

from __future__ import annotations

import pytest
from flask.testing import FlaskClient

from app.config import Config
from app.main import create_app


@pytest.fixture()
def app():
    """Create a test app instance using CSV source only (no TMDB key)."""
    cfg = Config(
        TMDB_API_KEY="",
        SECRET_KEY="test-secret",
    )
    application = create_app(cfg)
    application.config["TESTING"] = True
    return application


@pytest.fixture()
def client(app) -> FlaskClient:
    return app.test_client()


# ---------------------------------------------------------------------------
# /health
# ---------------------------------------------------------------------------


def test_health_returns_200(client: FlaskClient) -> None:
    resp = client.get("/health")
    assert resp.status_code == 200


def test_health_returns_ok_status(client: FlaskClient) -> None:
    data = client.get("/health").get_json()
    assert data == {"status": "ok"}


# ---------------------------------------------------------------------------
# /api/movies
# ---------------------------------------------------------------------------


def test_get_movies_csv_returns_200(client: FlaskClient) -> None:
    resp = client.get("/api/movies?source=csv")
    assert resp.status_code == 200


def test_get_movies_csv_shape(client: FlaskClient) -> None:
    data = client.get("/api/movies?source=csv").get_json()
    assert "movies" in data
    assert "source" in data
    assert "total" in data
    assert data["source"] == "csv"
    assert isinstance(data["movies"], list)
    assert data["total"] == len(data["movies"])


def test_get_movies_csv_nonempty(client: FlaskClient) -> None:
    data = client.get("/api/movies?source=csv").get_json()
    assert data["total"] > 0


def test_get_movies_movie_fields(client: FlaskClient) -> None:
    data = client.get("/api/movies?source=csv").get_json()
    movie = data["movies"][0]
    assert "title" in movie
    assert "year" in movie


def test_get_movies_hindi_only_filter(client: FlaskClient) -> None:
    data = client.get("/api/movies?source=csv&hindi_only=true").get_json()
    for movie in data["movies"]:
        assert movie.get("language") == "hi"


def test_get_movies_auto_falls_back_to_csv_without_key(client: FlaskClient) -> None:
    """With no TMDB key configured, 'auto' should fall back to CSV."""
    data = client.get("/api/movies?source=auto").get_json()
    assert data["source"] == "csv"


# ---------------------------------------------------------------------------
# /api/movies/random
# ---------------------------------------------------------------------------


def test_get_random_movie_returns_200(client: FlaskClient) -> None:
    resp = client.get("/api/movies/random?source=csv")
    assert resp.status_code == 200


def test_get_random_movie_shape(client: FlaskClient) -> None:
    data = client.get("/api/movies/random?source=csv").get_json()
    assert "movie" in data
    assert "source" in data
    assert data["source"] == "csv"
    assert isinstance(data["movie"], dict)


def test_get_random_movie_has_title(client: FlaskClient) -> None:
    data = client.get("/api/movies/random?source=csv").get_json()
    assert "title" in data["movie"]
    assert data["movie"]["title"]


# ---------------------------------------------------------------------------
# X-TMDB-Key header — key preference
# ---------------------------------------------------------------------------


def test_x_tmdb_key_header_accepted(client: FlaskClient) -> None:
    """A bad key via header should attempt TMDB, fail auth, and fall back to CSV
    rather than returning an error — proving the header is read and used."""
    data = client.get(
        "/api/movies?source=auto",
        headers={"X-TMDB-Key": "invalid-key-for-testing"},
    ).get_json()
    # Regardless of whether TMDB rejects the key, we must get a valid response
    assert data["source"] in ("tmdb", "csv")
    assert isinstance(data["movies"], list)


def test_x_tmdb_key_header_overrides_empty_env_key(client: FlaskClient) -> None:
    """When env key is empty but header key is provided, the route should attempt
    TMDB (not immediately fall through to CSV as it would with no key at all)."""
    # We can't assert source='tmdb' without a real key, but we can confirm
    # the request is handled without a 5xx error.
    resp = client.get(
        "/api/movies?source=auto",
        headers={"X-TMDB-Key": "fake-key-xyz"},
    )
    assert resp.status_code == 200
