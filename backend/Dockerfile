# Backend Dockerfile — Python 3.12 + uv + gunicorn
FROM python:3.12-slim AS base

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Copy dependency files first (Docker layer cache)
COPY backend/pyproject.toml backend/uv.lock ./

# Install dependencies (no dev extras, no editable install)
RUN uv sync --frozen --no-dev --no-install-project

# Copy application source
COPY backend/ .
COPY movies.csv ../movies.csv

# Install the project itself
RUN uv sync --frozen --no-dev

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
