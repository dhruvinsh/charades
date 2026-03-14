#!/usr/bin/env python3
"""
Enrich movies.csv with TMDB data: popularity, poster_path, language, difficulty.
Usage: python scripts/enrich_csv.py --tmdb-key YOUR_KEY [--input movies.csv] [--output movies_enriched.csv]
"""

from __future__ import annotations

import argparse
import csv
import sys
import time
from pathlib import Path

import httpx

TMDB_BASE = "https://api.themoviedb.org/3"
# TMDB allows 40 requests per 10 seconds
RATE_LIMIT_INTERVAL = 10.0 / 38  # ~0.26s between requests


def search_movie(client: httpx.Client, api_key: str, title: str, year: str | None) -> dict | None:
    """Search TMDB for a movie; return first result or None."""
    params: dict = {"api_key": api_key, "query": title, "include_adult": "false"}
    if year and year.isdigit():
        params["year"] = year
    try:
        resp = client.get(f"{TMDB_BASE}/search/movie", params=params, timeout=10.0)
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results", [])
        if not results:
            return None
        return results[0]
    except Exception:
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Enrich movies CSV with TMDB data")
    parser.add_argument("--tmdb-key", required=True, help="TMDB API key")
    parser.add_argument("--input", default="movies.csv", help="Input CSV path")
    parser.add_argument("--output", default="movies_enriched.csv", help="Output CSV path")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)
    if not input_path.exists():
        print(f"Error: input file not found: {input_path}", file=sys.stderr)
        return 1

    rows: list[dict] = []
    with input_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        for row in reader:
            rows.append(dict(row))

    # Ensure we have required columns
    required = {"MOVIE_ID", "MOVIE_TITLE", "MOVIE_RELEASE_YEAR"}
    if not required.issubset(set(rows[0].keys()) if rows else set()):
        print("Error: CSV must have MOVIE_ID, MOVIE_TITLE, MOVIE_RELEASE_YEAR", file=sys.stderr)
        return 1

    enriched: list[dict] = []
    matched = 0
    total = len(rows)

    with httpx.Client(headers={"Accept": "application/json"}) as client:
        for i, row in enumerate(rows):
            title = (row.get("MOVIE_TITLE") or "").strip()
            year_raw = (row.get("MOVIE_RELEASE_YEAR") or "").strip()
            if not title:
                enriched.append({
                    **row,
                    "TMDB_ID": "",
                    "POPULARITY": "0",
                    "VOTE_AVERAGE": "",
                    "VOTE_COUNT": "",
                    "POSTER_PATH": "",
                    "ORIGINAL_LANGUAGE": "hi",
                    "GENRE_IDS": "",
                    "DIFFICULTY": "medium",
                })
                continue
            time.sleep(RATE_LIMIT_INTERVAL)
            result = search_movie(client, args.tmdb_key, title, year_raw if year_raw.isdigit() else None)
            if (i + 1) % 20 == 0 or i == 0:
                print(f"Progress: {i + 1}/{total}", file=sys.stderr)
            if result:
                matched += 1
                popularity = result.get("popularity") or 0
                poster = (result.get("poster_path") or "").strip()
                if poster and not poster.startswith("/"):
                    poster = "/" + poster
                genre_ids = result.get("genre_ids") or []
                genre_str = "|".join(str(g) for g in genre_ids) if isinstance(genre_ids, list) else ""
                enriched.append({
                    **row,
                    "TMDB_ID": str(result.get("id", "")),
                    "POPULARITY": str(float(popularity)),
                    "VOTE_AVERAGE": str(result.get("vote_average", "")),
                    "VOTE_COUNT": str(result.get("vote_count", "")),
                    "POSTER_PATH": poster,
                    "ORIGINAL_LANGUAGE": result.get("original_language", "hi"),
                    "GENRE_IDS": genre_str,
                    "DIFFICULTY": "",  # filled after we have all popularities
                })
            else:
                enriched.append({
                    **row,
                    "TMDB_ID": "",
                    "POPULARITY": "0",
                    "VOTE_AVERAGE": "",
                    "VOTE_COUNT": "",
                    "POSTER_PATH": "",
                    "ORIGINAL_LANGUAGE": "hi",
                    "GENRE_IDS": "",
                    "DIFFICULTY": "medium",
                })

    # Compute difficulty from popularity ranking (only among rows that have POPULARITY)
    with_pop: list[tuple[int, float]] = []
    for idx, r in enumerate(enriched):
        try:
            pop = float(r.get("POPULARITY", "0") or "0")
            with_pop.append((idx, pop))
        except ValueError:
            pass
    with_pop.sort(key=lambda x: -x[1])
    n = len(with_pop)
    for rank, (idx, _) in enumerate(with_pop):
        if n >= 30:
            if rank < n / 3:
                enriched[idx]["DIFFICULTY"] = "easy"
            elif rank < 2 * n / 3:
                enriched[idx]["DIFFICULTY"] = "medium"
            else:
                enriched[idx]["DIFFICULTY"] = "hard"
        else:
            enriched[idx]["DIFFICULTY"] = "medium"
    for r in enriched:
        if not r.get("DIFFICULTY"):
            r["DIFFICULTY"] = "medium"

    out_fields = list(fieldnames) + [
        "TMDB_ID", "POPULARITY", "VOTE_AVERAGE", "VOTE_COUNT",
        "POSTER_PATH", "ORIGINAL_LANGUAGE", "GENRE_IDS", "DIFFICULTY",
    ]
    with output_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=out_fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(enriched)

    print(f"Done: {matched}/{total} matched. Output: {output_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
