# Charades

A **Bollywood charades** game — generates random Bollywood and Indian regional film titles with a countdown timer, adjustable difficulty, live TMDB data, and full PWA support.

[![CI](https://github.com/dhruvinsh/charades/actions/workflows/ci.yml/badge.svg)](https://github.com/dhruvinsh/charades/actions/workflows/ci.yml)

## Features

- **TMDB integration** — fetches live Bollywood/Indian films (Hindi, Tamil, Telugu, Malayalam); falls back to a bundled CSV of 400 movies when the API key is absent or unreachable
- **User-configurable TMDB key** — enter your own API key in the Settings panel; it is stored in `localStorage` only and sent to the backend as an `X-TMDB-Key` header — never in the URL or response
- **Source indicator** — Navbar shows a green "Live" badge (TMDB) or amber "Offline data" badge (CSV fallback) in real time
- **Offline-first PWA** — installable on mobile/desktop; movies cached in IndexedDB (Dexie) for 24 hours; TMDB poster images cached for 7 days
- **Adjustable difficulty**
  - Timer: 30s / 1 min / 90s / 2 min / 3 min / custom (10–600s)
  - Movie era: All / 90s / 2000s / 2010s / 2020s
  - Language: All Indian / Hindi only
  - Popularity tier: Easy (blockbusters) / Medium (popular) / Hard (obscure)
  - Skip limit: ∞ / 5 / 3 / 1 / 0
  - Hints: word count + release year (toggle)
- **Blurred poster background** — TMDB poster shown blurred on the movie card during a round
- **Sound effects** — audio cues on round start and round end
- **Full randomization** — Fisher-Yates shuffle, play-history deduplication per session (stored in IndexedDB)
- **Docker** — single `docker compose up --build` deploys backend + Nginx-served frontend
- **Multi-arch images** — CI builds `linux/amd64` and `linux/arm64` on every release tag

## Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12 + Flask 3 + uv |
| Frontend | Vite 7 + React 19 + TypeScript + Tailwind CSS v4 |
| State | Zustand 5 (settings persisted to `localStorage`) |
| Cache | Dexie.js 4 (IndexedDB — movies, play history) |
| PWA | vite-plugin-pwa 1 + Workbox (cache-first static, network-first API) |
| Deploy | Docker Compose — backend (Gunicorn) + frontend (Nginx) |
| CI/CD | GitHub Actions → GHCR on `v*` semver tags |

## Quick Start (Docker)

```bash
# 1. Clone
git clone https://github.com/dhruvinsh/charades.git
cd charades

# 2. Configure
cp .env.example .env
# Edit .env — add TMDB_API_KEY (optional; CSV fallback used if omitted)

# 3. Build and run
docker compose up --build -d

# 4. Open
open http://localhost
```

The backend is not exposed directly to the host. All traffic routes through Nginx on port 80 — `/api/*` requests are proxied to the backend container internally.

## Local Development

### Prerequisites

- [uv](https://docs.astral.sh/uv/) (Python package manager)
- Node.js 22+

### Backend

```bash
cd backend
cp ../.env.example ../.env   # edit and add your keys
uv sync --extra dev          # installs all deps including dev tools
uv run python wsgi.py        # Flask on http://localhost:5001
```

> `wsgi.py` auto-detects a stale `frontend/dist/` on startup and runs `npm install && npm run build` if `npm` is on your PATH. In Docker, `npm` is absent in the backend container so this step is silently skipped.

### Frontend

```bash
cd frontend
npm install
npm run dev    # Vite on http://localhost:5173 — proxies /api/* to :5001
```

### Running both together

```bash
# Terminal 1
cd backend && uv run python wsgi.py

# Terminal 2
cd frontend && npm run dev

# Open http://localhost:5173
```

### Backend tests

```bash
cd backend
uv run pytest --tb=short -q
```

13 tests covering all routes and the `X-TMDB-Key` header flow.

### Frontend lint / type-check / build

```bash
cd frontend
npm run lint       # ESLint
npx tsc -b --noEmit  # TypeScript check
npm run build      # production build → frontend/dist/
```

## API Routes

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness check — returns `{"status": "ok"}` |
| `GET` | `/api/movies` | Fetch a batch of movies (see params below) |
| `GET` | `/api/movies/random` | Fetch a single random movie |

### `GET /api/movies` query parameters

| Param | Default | Description |
|---|---|---|
| `hindi_only` | `false` | `1` / `true` / `yes` to restrict to Hindi (`hi`) only |
| `pages` | `5` | TMDB pages to fetch (1 page = 20 movies, max `10`) |
| `sort_by` | `popularity.desc` | TMDB sort field |
| `source` | `auto` | `auto` tries TMDB then CSV; `csv` forces CSV; `tmdb` forces TMDB |

TMDB API key resolution order: `X-TMDB-Key` request header → `TMDB_API_KEY` env var.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SECRET_KEY` | Yes | Flask session secret — generate with `python3 -c "import secrets; print(secrets.token_hex(32))"` |
| `TMDB_API_KEY` | No | Server-side TMDB key. Get a free key at [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api). Omit to use CSV fallback. |
| `TMDB_LANGUAGES` | No | Pipe-separated ISO 639-1 language codes (default: `hi|ta|te|ml`) |
| `TMDB_PAGES_PER_BATCH` | No | Pages fetched per batch, max `10` (default: `5`) |
| `FLASK_ENV` | No | `development` enables debug mode (default: `production`) |
| `CORS_ORIGINS` | No | Comma-separated allowed CORS origins (default: `http://localhost:5173`) |

## Releases

Docker images are automatically published to GHCR on semver tags (`v*`). Both `linux/amd64` and `linux/arm64` platforms are built.

```bash
docker pull ghcr.io/dhruvinsh/charades-backend:latest
docker pull ghcr.io/dhruvinsh/charades-frontend:latest
```

Tags follow the pattern `<major>.<minor>.<patch>`, `<major>.<minor>`, `<major>`, and `latest`. Pre-release tags (containing `-rc`, `-beta`, or `-alpha`) are marked as pre-releases on GitHub.

To cut a release:

```bash
git tag v2.0.0
git push origin v2.0.0
```

## Project Structure

```
charades/
├── movies.csv                   # bundled fallback — 400 Bollywood titles
├── docker-compose.yml
├── docker/nginx.conf
├── .env.example
│
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml           # charades v2.0.0, Python ≥3.12
│   ├── gunicorn.conf.py
│   ├── wsgi.py                  # WSGI entry + auto-rebuild frontend
│   └── app/
│       ├── main.py              # Flask app factory, SPA catch-all
│       ├── config.py            # dataclass config from env vars
│       ├── routes/
│       │   ├── health.py        # GET /health
│       │   └── movies.py        # GET /api/movies, GET /api/movies/random
│       └── services/
│           ├── tmdb.py          # TMDB Discover API client (httpx)
│           └── csv_fallback.py  # loads movies.csv
│   └── tests/
│       └── test_routes.py       # 13 pytest tests
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json             # charades-frontend, Vite 7, React 19
│   ├── vite.config.ts           # PWA manifest, Workbox, dev proxy
│   └── src/
│       ├── App.tsx
│       ├── types.ts
│       ├── components/
│       │   ├── Navbar.tsx       # source badge (Live / Offline data)
│       │   ├── MovieCard.tsx    # blurred poster background
│       │   ├── Timer.tsx        # countdown bar + sound effects
│       │   ├── Controls.tsx     # Generate / Skip / Got It / Reset
│       │   └── SettingsPanel.tsx # all settings + TMDB key input
│       ├── db/dexie.ts          # CharadesDB — movies + play history
│       ├── hooks/
│       │   ├── useMovies.ts     # fetch, cache, filter logic
│       │   └── useTimer.ts      # interval tick + audio
│       ├── services/api.ts      # fetch wrapper — X-TMDB-Key header
│       └── store/gameStore.ts   # Zustand — game state + settings
│
└── .github/workflows/
    ├── ci.yml                   # lint + typecheck + build on every push
    └── release.yml              # build & push to GHCR on v* tags
```

## Third Party

- [Flask](https://flask.palletsprojects.com/) (BSD-3-Clause)
- [React](https://react.dev/) (MIT)
- [Vite](https://vite.dev/) (MIT)
- [Tailwind CSS](https://tailwindcss.com/) (MIT)
- [Dexie.js](https://dexie.org/) (Apache-2.0)
- [Zustand](https://zustand.docs.pmnd.rs/) (MIT)
- [Lucide](https://lucide.dev/) (ISC)
- [TMDB API](https://www.themoviedb.org/) (used under TMDB Terms of Use)
