"""Health-check domain logic.

Keeps the connectivity check isolated from the API layer so it is easy to
unit-test and reuse across the liveness / readiness / summary endpoints.
"""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.schemas.health import HealthResponse, LivenessResponse, ReadinessResponse

logger = logging.getLogger(__name__)


def check_database(db: Session) -> bool:
    """Return True if a trivial round-trip query against PostgreSQL succeeds.

    Any failure is logged server-side with detail and reported to the caller as
    a plain boolean - no connection strings, credentials or stack traces cross
    this boundary.
    """
    try:
        db.execute(text("SELECT 1"))
        return True
    except SQLAlchemyError:
        logger.warning("Database connectivity check failed", exc_info=True)
        return False


def build_liveness() -> LivenessResponse:
    """Liveness never touches a dependency."""
    return LivenessResponse(service=settings.SERVICE_NAME)


def build_readiness(db: Session) -> tuple[ReadinessResponse, bool]:
    """Return the readiness report and whether every dependency is healthy."""
    db_ok = check_database(db)
    report = ReadinessResponse(
        status="ready" if db_ok else "not_ready",
        service=settings.SERVICE_NAME,
        database="healthy" if db_ok else "unhealthy",
    )
    return report, db_ok


def build_health_summary(db: Session) -> tuple[HealthResponse, bool]:
    """Backwards-compatible summarized status for ``GET /api/v1/health``."""
    db_ok = check_database(db)
    report = HealthResponse(
        status="healthy" if db_ok else "degraded",
        service=settings.SERVICE_NAME,
        database="healthy" if db_ok else "unhealthy",
    )
    return report, db_ok
