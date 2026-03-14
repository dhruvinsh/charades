# Charades — single-container build
#
# Stage 1: Build the Vite frontend
# Stage 2: Python 3.12-slim + uv + Gunicorn — only what's needed at runtime

# ─── Stage 1: Frontend build ──────────────────────────────────────────────────
FROM node:22-alpine AS frontend-builder

WORKDIR /frontend

# Install dependencies (cached layer — only re-runs if manifests change)
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --legacy-peer-deps

# Copy source and build
COPY frontend/ .
RUN npm run build


# ─── Stage 2: Python runtime ──────────────────────────────────────────────────
FROM python:3.12-slim AS final

# Pin uv version for reproducible builds
COPY --from=ghcr.io/astral-sh/uv:0.10.10 /uv /bin/uv

WORKDIR /app

# Install Python dependencies before copying app source (layer cache)
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project --no-cache

# Copy application source (tests excluded via .dockerignore)
COPY backend/ .

# Install the project package itself
RUN uv sync --frozen --no-dev --no-cache

# Copy bundled CSV fallback to the project root the app expects
COPY movies.csv ../movies.csv

# Copy the built frontend dist — Flask serves it via the SPA catch-all route
# Path: /app/../frontend/dist = /frontend/dist  (matches main.py _FRONTEND_DIST)
COPY --from=frontend-builder /frontend/dist /frontend/dist

# Non-root user for security
RUN adduser --system --no-create-home --group appuser
USER appuser

EXPOSE 5000

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/app/.venv/bin:$PATH"

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/health')"

CMD ["gunicorn", "--config", "gunicorn.conf.py", "wsgi:app"]
