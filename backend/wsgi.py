"""WSGI entry point.

On startup, automatically rebuilds the frontend (npm run build) when:
  - npm is available on PATH, AND
  - frontend/dist is missing or older than any file in frontend/src or package.json

This keeps the served SPA in sync with the source without any manual step.
In Docker (backend-only container) npm will not be present and the step is
skipped silently — the Dockerfile COPY handles the pre-built dist in that case.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

# Paths are resolved relative to this file: backend/wsgi.py → project root
_ROOT = Path(__file__).resolve().parent.parent
_FRONTEND_DIR = _ROOT / "frontend"
_DIST_SENTINEL = _FRONTEND_DIR / "dist" / "index.html"
# Files/dirs whose mtime is compared against the built dist
_SOURCE_PATHS = [
    _FRONTEND_DIR / "src",
    _FRONTEND_DIR / "package.json",
    _FRONTEND_DIR / "vite.config.ts",
    _FRONTEND_DIR / "tsconfig.app.json",
    _FRONTEND_DIR / "index.html",
]


def _newest_mtime(path: Path) -> float:
    """Return the most recent mtime under *path* (recurses into directories)."""
    if path.is_file():
        return path.stat().st_mtime
    if path.is_dir():
        mtimes = [p.stat().st_mtime for p in path.rglob("*") if p.is_file()]
        return max(mtimes) if mtimes else 0.0
    return 0.0


def _frontend_needs_build() -> bool:
    if not _DIST_SENTINEL.exists():
        return True
    dist_mtime = _DIST_SENTINEL.stat().st_mtime
    for src_path in _SOURCE_PATHS:
        if _newest_mtime(src_path) > dist_mtime:
            return True
    return False


def build_frontend() -> None:
    """Run `npm install` + `npm run build` in the frontend directory."""
    npm = shutil.which("npm")
    if npm is None:
        logger.debug("npm not found on PATH — skipping frontend build")
        return

    if not _FRONTEND_DIR.exists():
        logger.warning("frontend/ directory not found at %s — skipping build", _FRONTEND_DIR)
        return

    if not _frontend_needs_build():
        logger.info("Frontend dist is up to date — skipping build")
        return

    logger.info("Frontend dist is missing or stale — rebuilding…")

    # npm install (fast no-op if node_modules is already current)
    install_result = subprocess.run(
        [npm, "install"],
        cwd=str(_FRONTEND_DIR),
        capture_output=True,
        text=True,
    )
    if install_result.returncode != 0:
        logger.error("npm install failed:\n%s", install_result.stderr)
        return

    # npm run build
    build_result = subprocess.run(
        [npm, "run", "build"],
        cwd=str(_FRONTEND_DIR),
        capture_output=True,
        text=True,
    )
    if build_result.returncode != 0:
        logger.error("npm run build failed:\n%s", build_result.stderr)
        return

    logger.info("Frontend built successfully")


# ---------------------------------------------------------------------------
# Run the build before the app is created so Flask's SPA route picks it up
# ---------------------------------------------------------------------------

logging.basicConfig(
    stream=sys.stdout,
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)

build_frontend()

from app.main import create_app  # noqa: E402 — must come after build_frontend()

app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=app.config.get("DEBUG", False))
