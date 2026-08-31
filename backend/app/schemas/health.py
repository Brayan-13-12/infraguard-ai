"""Response schemas for the health endpoints.

Three distinct concerns, three schemas:

* liveness  - is the FastAPI process running? (no dependencies)
* readiness - are downstream dependencies (PostgreSQL) usable?
* health    - a summarized system view (backwards-compatible)
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ComponentStatus = Literal["healthy", "unhealthy"]


class LivenessResponse(BaseModel):
    """Process is up. Always 200 while FastAPI can serve requests."""

    status: Literal["alive"] = "alive"
    service: str = Field(description="Logical service name.")

    model_config = {
        "json_schema_extra": {
            "examples": [{"status": "alive", "service": "infraguard-api"}]
        }
    }


class ReadinessResponse(BaseModel):
    """Dependency health. 200 when ready, 503 when a dependency is down.

    The same schema is returned for both status codes so the OpenAPI contract is
    unambiguous. Internal error detail is never included.
    """

    status: Literal["ready", "not_ready"] = Field(description="Aggregate readiness.")
    service: str = Field(description="Logical service name.")
    database: ComponentStatus = Field(
        description="Result of a live PostgreSQL connectivity check."
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"status": "ready", "service": "infraguard-api", "database": "healthy"},
                {
                    "status": "not_ready",
                    "service": "infraguard-api",
                    "database": "unhealthy",
                },
            ]
        }
    }


class HealthResponse(BaseModel):
    """Summarized system status. 200 when healthy, 503 when degraded.

    Kept for backwards compatibility with ``GET /api/v1/health``. It mirrors the
    readiness result using ``healthy``/``degraded`` wording. The identical schema
    is documented for the 200 and 503 responses.
    """

    status: Literal["healthy", "degraded"] = Field(description="Aggregate system status.")
    service: str = Field(description="Logical service name.")
    database: ComponentStatus = Field(
        description="Result of a live PostgreSQL connectivity check."
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"status": "healthy", "service": "infraguard-api", "database": "healthy"},
                {
                    "status": "degraded",
                    "service": "infraguard-api",
                    "database": "unhealthy",
                },
            ]
        }
    }
