"""TMDB API client — fetches Bollywood movies via the Discover endpoint."""

from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)


def _era_from_year(year: int | None) -> str:
    if year is None:
        return "unknown"
    if year < 2000:
        return "90s"
    if year < 2010:
        return "2000s"
    if year < 2020:
        return "2010s"
    return "2020s"


def _parse_movie(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalize a raw TMDB movie object into our internal schema."""
    raw_date: str = raw.get("release_date") or ""
    year: int | None = int(raw_date[:4]) if len(raw_date) >= 4 and raw_date[:4].isdigit() else None
    return {
        "id": str(raw.get("id", "")),
        "title": raw.get("title") or raw.get("original_title") or "",
        "year": year,
        "language": raw.get("original_language", "hi"),
        "original_language": raw.get("original_language", "hi"),
        "popularity": float(raw.get("popularity", 0)),
        "poster_path": raw.get("poster_path"),
        "source": "tmdb",
        "era": _era_from_year(year),
        "tmdb_id": raw.get("id"),
    }


class TMDBClient:
    """Synchronous TMDB client using httpx."""

    def __init__(self, api_key: str, base_url: str = "https://api.themoviedb.org/3") -> None:
        self.api_key = api_key
        self.base_url = base_url
        self._client = httpx.Client(
            base_url=base_url,
            timeout=10.0,
            headers={"Accept": "application/json"},
        )

    def close(self) -> None:
        self._client.close()

    def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        params = params or {}
        params["api_key"] = self.api_key
        resp = self._client.get(path, params=params)
        resp.raise_for_status()
        return resp.json()  # type: ignore[no-any-return]

    def fetch_movies_batch(
        self,
        languages: str = "hi|ta|te|ml",
        pages: int = 5,
        hindi_only: bool = False,
        sort_by: str = "popularity.desc",
    ) -> list[dict[str, Any]]:
        """
        Fetch `pages` pages of discover results for Indian movies.
        Returns a flat list of normalized movie dicts.
        """
        lang_filter = "hi" if hindi_only else languages
        all_movies: list[dict[str, Any]] = []
        seen_ids: set[str] = set()

        for page in range(1, pages + 1):
            try:
                data = self._get(
                    "/discover/movie",
                    params={
                        "with_original_language": lang_filter,
                        "region": "IN",
                        "sort_by": sort_by,
                        "page": page,
                        "include_adult": "false",
                        "vote_count.gte": "10",
                    },
                )
                for raw in data.get("results", []):
                    movie_id = str(raw.get("id", ""))
                    if movie_id and movie_id not in seen_ids:
                        seen_ids.add(movie_id)
                        all_movies.append(_parse_movie(raw))
            except httpx.HTTPError as exc:
                logger.warning("TMDB page %d failed: %s", page, exc)
                break

        logger.info(
            "Fetched %d movies from TMDB (pages=%d, languages=%s)",
            len(all_movies),
            pages,
            lang_filter,
        )
        return all_movies
