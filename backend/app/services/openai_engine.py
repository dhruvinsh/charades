"""OpenAI game engine — generates movie batches with hints for charades."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

logger = logging.getLogger(__name__)

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"


def _build_prompt(difficulty: str, era: str, language: str, batch_size: int) -> str:
    era_desc = "any era" if era == "all" else f"the {era}"
    lang_desc = "Hindi only" if language == "hindi" else "all Indian languages"
    return f"""You are a Bollywood movie expert for a charades game.
Generate exactly {batch_size} different movies matching:
- Difficulty: {difficulty} (easy=iconic blockbusters everyone knows, medium=well-known, hard=obscure/cult/art films)
- Era: {era_desc}
- Language: {lang_desc}

Return ONLY a valid JSON array, no other text. Each object must have:
- "title": string (exact or common English title as on TMDB)
- "year": number (release year)
- "language": string, e.g. "hi"
- "hints": object with optional "tagline", "actor_clue", "famous_dialogue" (short, spoiler-free hints)

Example format:
[{{"title": "Dilwale Dulhania Le Jayenge", "year": 1995, "language": "hi", "hints": {{"tagline": "A romance on a Europe trip", "actor_clue": "Stars Shah Rukh Khan and Kajol", "famous_dialogue": "Palat"}}}}]
"""


def generate_movie_batch(
    api_key: str,
    model: str,
    difficulty: str,
    era: str,
    language: str,
    batch_size: int = 15,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """
    Call OpenAI to generate a batch of movie suggestions with hints.
    Returns (list of {title, year, language, hints}, token_usage dict).
    """
    prompt = _build_prompt(difficulty, era, language, batch_size)
    payload: dict[str, Any] = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "You output only valid JSON arrays. No markdown, no explanation.",
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "max_tokens": 4096,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(OPENAI_CHAT_URL, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    usage = data.get("usage", {})
    token_usage = {
        "prompt_tokens": usage.get("prompt_tokens", 0),
        "completion_tokens": usage.get("completion_tokens", 0),
        "model": data.get("model", model),
    }
    content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
    if not content:
        return [], token_usage
    # Strip markdown code block if present
    content = content.strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content)
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as e:
        logger.warning("OpenAI returned invalid JSON: %s", e)
        return [], token_usage
    if not isinstance(parsed, list):
        return [], token_usage
    movies: list[dict[str, Any]] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        title = (item.get("title") or "").strip()
        if not title:
            continue
        year = item.get("year")
        if year is not None and not isinstance(year, int):
            try:
                year = int(year)
            except (TypeError, ValueError):
                year = None
        hints = item.get("hints")
        if not isinstance(hints, dict):
            hints = {}
        movies.append(
            {
                "title": title,
                "year": year,
                "language": (item.get("language") or "hi").strip() or "hi",
                "hints": {
                    "tagline": (hints.get("tagline") or "").strip() or None,
                    "actor_clue": (hints.get("actor_clue") or "").strip() or None,
                    "famous_dialogue": (hints.get("famous_dialogue") or "").strip() or None,
                },
            }
        )
    logger.info("OpenAI generated %d movie suggestions (model=%s)", len(movies), model)
    return movies, token_usage
