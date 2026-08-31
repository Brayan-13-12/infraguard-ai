# syntax=docker/dockerfile:1.7

# ---------------------------------------------------------------------------
# InfraGuard AI - backend image
#
# Base image is pinned by digest for reproducibility; the human-readable tag is
# kept in the comment. To update: `docker buildx imagetools inspect python:<tag>`
# and replace both the tag comment and the digest below.
# ---------------------------------------------------------------------------
# python:3.13.1-slim-bookworm
FROM python@sha256:031ebf3cde9f3719d2db385233bcb18df5162038e9cda20e64e08f49f4b47a2f AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_ROOT_USER_ACTION=ignore

# Pin pip itself so builds do not drift as new pip releases land.
ARG PIP_VERSION=26.2.1
RUN pip install "pip==${PIP_VERSION}"

WORKDIR /app

# ---- Builder: build a wheelhouse from the hash-pinned lock ----
FROM base AS builder
# 1. Dependencies from the fully-resolved, hash-verified lock file.
COPY requirements.txt ./
RUN pip wheel --require-hashes --no-deps --wheel-dir /wheels -r requirements.txt
# 2. The application itself (build backend pinned in pyproject.toml).
COPY pyproject.toml README.md ./
COPY app ./app
RUN pip wheel --no-deps --wheel-dir /wheels .

# ---- Runtime ----
FROM base AS runtime

RUN groupadd --system app \
    && useradd --system --gid app --home-dir /app --shell /usr/sbin/nologin app

# Install only from the local wheelhouse - no index, no build step, no network.
COPY --from=builder /wheels /wheels
COPY requirements.txt ./
RUN pip install --no-index --no-deps --find-links=/wheels -r requirements.txt \
    && pip install --no-index --no-deps --find-links=/wheels infraguard-api \
    && rm -rf /wheels requirements.txt

# Migration assets are not part of the wheel.
COPY --chown=app:app alembic ./alembic
COPY --chown=app:app alembic.ini ./

USER app

EXPOSE 8000

# Container health = liveness only (process up). Readiness / PostgreSQL is a
# separate concern checked at GET /api/v1/health/ready.
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=5 \
    CMD python -c "import urllib.request,sys; \
r=urllib.request.urlopen('http://localhost:8000/api/v1/health/live', timeout=4); \
sys.exit(0 if r.status == 200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
