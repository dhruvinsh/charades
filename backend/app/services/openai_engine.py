"""OpenAI game engine — generates movie batches and AI hints for charades.

Two operating modes:
1. AI-only  (no TMDB): OpenAI suggests movie titles + hints from scratch.
2. AI+TMDB  (preferred): TMDB supplies validated movies; OpenAI only generates
   per-movie hints in a single batch call — far cheaper than validating each
   title individually.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

logger = logging.getLogger(__name__)

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _call_openai(
    api_key: str,
    model: str,
    system: str,
    user: str,
    temperature: float = 0.7,
    max_tokens: int = 4096,
) -> tuple[str, dict[str, Any]]:
    """
    Make a single OpenAI chat-completion call.
    Returns (content_text, token_usage_dict).
    """
    payload: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
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
    return content.strip(), token_usage


def _strip_code_fences(text: str) -> str:
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _parse_json_list(content: str) -> list[dict[str, Any]] | None:
    cleaned = _strip_code_fences(content)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.warning("OpenAI returned invalid JSON list: %s", exc)
        return None
    if not isinstance(parsed, list):
        return None
    return parsed


def _parse_json_dict(content: str) -> dict[str, Any] | None:
    cleaned = _strip_code_fences(content)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.warning("OpenAI returned invalid JSON dict: %s", exc)
        return None
    if not isinstance(parsed, dict):
        return None
    return parsed


# ---------------------------------------------------------------------------
# Mode 1: AI-only  (no TMDB available)
# OpenAI generates movie titles + hints; validated against CSV afterwards.
# ---------------------------------------------------------------------------

def _build_ai_only_prompt(difficulty: str, era: str, language: str, batch_size: int) -> str:
    era_desc = "any era" if era == "all" else f"the {era}"
    lang_desc = "Hindi only" if language == "hindi" else "all Indian languages"
    return (
        f"You are a Bollywood movie expert for a charades game.\n"
        f"Generate exactly {batch_size} DIFFERENT movies matching:\n"
        f"- Difficulty: {difficulty} "
        f"(easy=iconic blockbusters, medium=well-known, hard=obscure/cult/art films)\n"
        f"- Era: {era_desc}\n"
        f"- Language: {lang_desc}\n\n"
        f"Return ONLY a valid JSON array, no other text. Each object must have:\n"
        f'- "title": string (exact or common English title as on TMDB)\n'
        f'- "year": number (release year)\n'
        f'- "language": string, e.g. "hi"\n'
        f'- "hints": object with optional "tagline", "actor_clue", "famous_dialogue" '
        f"(short, spoiler-free hints)\n\n"
        f'Example: [{{"title":"Dilwale Dulhania Le Jayenge","year":1995,"language":"hi",'
        f'"hints":{{"tagline":"A romance on a Europe trip",'
        f'"actor_clue":"Stars Shah Rukh Khan and Kajol",'
        f'"famous_dialogue":"Palat"}}}}]'
    )


def generate_movie_batch(
    api_key: str,
    model: str,
    difficulty: str,
    era: str,
    language: str,
    batch_size: int = 15,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """
    AI-only mode: OpenAI generates movie suggestions + hints from scratch.
    Returns (list[{title, year, language, hints}], token_usage).
    """
    prompt = _build_ai_only_prompt(difficulty, era, language, batch_size)
    content, token_usage = _call_openai(
        api_key=api_key,
        model=model,
        system="You output only valid JSON arrays. No markdown, no explanation.",
        user=prompt,
        temperature=0.7,
        max_tokens=4096,
    )
    if not content:
        return [], token_usage

    parsed = _parse_json_list(content)
    if parsed is None:
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
    logger.info("OpenAI (AI-only) generated %d suggestions (model=%s)", len(movies), model)
    return movies, token_usage


# ---------------------------------------------------------------------------
# Mode 2: AI+TMDB
# TMDB supplies validated movies; OpenAI generates hints only (one batch call).
# Much cheaper: 1 TMDB discover call + 1 OpenAI hints call instead of
# 1 OpenAI titles call + N individual TMDB search calls.
# ---------------------------------------------------------------------------

def _build_hints_prompt(movies: list[dict[str, Any]]) -> str:
    movie_list = json.dumps(
        [{"title": m.get("title", ""), "year": m.get("year"), "language": m.get("language", "hi")}
         for m in movies],
        ensure_ascii=False,
    )
    return (
        "Generate charades hints for these Bollywood movies. "
        "For each, provide short spoiler-free clues:\n"
        f"{movie_list}\n\n"
        "Return ONLY a valid JSON object where each key is the exact movie title and the value "
        "is an object with optional fields: "
        '"tagline" (1-sentence mood/theme), '
        '"actor_clue" (lead actor(s) without naming the film), '
        '"famous_dialogue" (iconic line or phrase from the film).\n'
        'Example: {"Sholay": {"tagline": "Two outlaws hired to catch a bandit",'
        '"actor_clue": "Stars Amitabh Bachchan and Dharmendra",'
        '"famous_dialogue": "Kitne aadmi the?"}}'
    )


def generate_hints_for_movies(
    api_key: str,
    model: str,
    movies: list[dict[str, Any]],
) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    """
    Generate AI hints for a pre-selected list of TMDB movies in a single call.
    Returns (hints_by_title_dict, token_usage).
    """
    if not movies:
        return {}, {"prompt_tokens": 0, "completion_tokens": 0, "model": model}

    prompt = _build_hints_prompt(movies)
    content, token_usage = _call_openai(
        api_key=api_key,
        model=model,
        system="You output only valid JSON objects. No markdown, no explanation.",
        user=prompt,
        temperature=0.5,
        max_tokens=2048,
    )
    if not content:
        return {}, token_usage

    parsed = _parse_json_dict(content)
    if parsed is None:
        return {}, token_usage

    hints_by_title: dict[str, dict[str, Any]] = {}
    for title, raw_hints in parsed.items():
        if not isinstance(raw_hints, dict):
            continue
        hints_by_title[title] = {
            "tagline": (raw_hints.get("tagline") or "").strip() or None,
            "actor_clue": (raw_hints.get("actor_clue") or "").strip() or None,
            "famous_dialogue": (raw_hints.get("famous_dialogue") or "").strip() or None,
        }

    logger.info(
        "OpenAI generated hints for %d/%d movies (model=%s)",
        len(hints_by_title),
        len(movies),
        model,
    )
    return hints_by_title, token_usage
