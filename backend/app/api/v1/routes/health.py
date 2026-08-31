"""Health endpoints.

* ``GET /api/v1/health/live``  - liveness  (no dependencies, always 200 if up)
* ``GET /api/v1/health/ready`` - readiness (checks PostgreSQL; 200 or 503)
* ``GET /api/v1/health``       - summarized system status (200 or 503)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.health import HealthResponse, LivenessResponse, ReadinessResponse
from app.services.health import build_health_summary, build_liveness, build_readiness

router = APIRouter(prefix="/health", tags=["health"])

_READINESS_RESPONSES = {
    200: {"model": ReadinessResponse, "description": "All dependencies are healthy."},
    503: {"model": ReadinessResponse, "description": "A dependency is unavailable."},
}
_SUMMARY_RESPONSES = {
    200: {"model": HealthResponse, "description": "System is healthy."},
    503: {"model": HealthResponse, "description": "System is degraded."},
}


@router.get(
    "/live",
    response_model=LivenessResponse,
    summary="Liveness probe",
    responses={200: {"model": LivenessResponse, "description": "Process is alive."}},
)
def liveness() -> LivenessResponse:
    """Confirm the FastAPI process is running. Does not touch PostgreSQL."""
    return build_liveness()


@router.get(
    "/ready",
    response_model=ReadinessResponse,
    summary="Readiness probe",
    responses=_READINESS_RESPONSES,
)
def readiness(response: Response, db: Session = Depends(get_db)) -> ReadinessResponse:
    """Confirm downstream dependencies (PostgreSQL) are usable."""
    report, ready = build_readiness(db)
    if not ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return report


@router.get(
    "",
    response_model=HealthResponse,
    summary="Summarized system status",
    responses=_SUMMARY_RESPONSES,
)
def health(response: Response, db: Session = Depends(get_db)) -> HealthResponse:
    """Summarized status. Equivalent to readiness, using healthy/degraded wording."""
    report, healthy = build_health_summary(db)
    if not healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return report
