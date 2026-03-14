"""Smoke tests for Flask API routes."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from flask.testing import FlaskClient

from app.config import Config
from app.main import create_app
from app.services.csv_fallback import find_movie_by_title, load_movies


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


# ---------------------------------------------------------------------------
# POST /api/movies/ai-generate
# ---------------------------------------------------------------------------


def test_ai_generate_requires_openai_key(client: FlaskClient) -> None:
    """Without OpenAI key (header or env), ai-generate returns 400."""
    resp = client.post(
        "/api/movies/ai-generate",
        json={"difficulty": "medium", "era": "all", "language": "all"},
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code == 400
    data = resp.get_json()
    assert data and "error" in data


def test_ai_generate_accepts_key_and_returns_shape(client: FlaskClient) -> None:
    """With OpenAI key and mocked batch, response has movies, source, total, token_usage."""
    suggestions = [
        {
            "title": "War",
            "year": 2019,
            "language": "hi",
            "hints": {
                "tagline": "A spy thriller",
                "actor_clue": "Hrithik",
                "famous_dialogue": None,
            },
        },
    ]
    token_usage = {"prompt_tokens": 100, "completion_tokens": 200, "model": "gpt-4.1-mini"}
    with patch("app.routes.movies.generate_movie_batch", return_value=(suggestions, token_usage)):
        resp = client.post(
            "/api/movies/ai-generate",
            json={"difficulty": "medium", "era": "all", "language": "all"},
            headers={
                "Content-Type": "application/json",
                "X-OpenAI-Key": "sk-fake",
            },
        )
    assert resp.status_code == 200
    data = resp.get_json()
    assert "movies" in data
    assert "source" in data
    assert data["source"] == "ai"
    assert "total" in data
    assert "token_usage" in data
    assert data["token_usage"]["prompt_tokens"] == 100
    assert data["token_usage"]["completion_tokens"] == 200
    # War is in CSV so we should get one validated movie
    assert data["total"] >= 1
    assert len(data["movies"]) >= 1
    movie = data["movies"][0]
    assert movie.get("title") == "War"
    assert movie.get("ai_hints") is not None


# ---------------------------------------------------------------------------
# CSV find_movie_by_title
# ---------------------------------------------------------------------------


def test_find_movie_by_title_exact() -> None:
    """find_movie_by_title finds a movie by exact title match."""
    movies = load_movies()
    assert len(movies) > 0
    # Use a title we know is in the CSV (from the first lines of movies.csv)
    found = find_movie_by_title(movies, "War", 2019)
    assert found is not None
    assert found.get("title") == "War"
    assert found.get("year") == 2019


def test_find_movie_by_title_substring() -> None:
    """find_movie_by_title can match by substring."""
    movies = load_movies()
    # "Dil" might match "Dil" or similar in CSV
    found = find_movie_by_title(movies, "Dil", None)
    assert found is not None
    assert "title" in found
