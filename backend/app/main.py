"""InfraGuard AI - FastAPI application entrypoint."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import Response

from app import __version__
from app.api.errors import register_exception_handlers
from app.api.request_context import request_id_middleware
from app.api.v1.router import api_router
from app.core.config import settings

logging.basicConfig(level=logging.INFO)

_AUTH_PATH_PREFIX = f"{settings.API_V1_PREFIX}/auth"


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=__version__,
        description="AI-powered infrastructure intelligence and incident management platform.",
        # OpenAPI docs stay available at /docs; schema is served at /openapi.json.
        docs_url="/docs",
        redoc_url=None,
        openapi_url="/openapi.json",
    )

    # Credentials are enabled for the auth cookie. This is only safe because the
    # origin list is explicit (never "*") - enforced by config in production.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=600,
    )

    @app.middleware("http")
    async def _no_store_auth_responses(request: Request, call_next) -> Response:
        """Authentication / session responses must never be cached by browsers or
        intermediaries. Applies to every response under /api/v1/auth, including
        error responses (401 / 403 / 409 / 422 / 429)."""
        response = await call_next(request)
        if request.url.path.startswith(_AUTH_PATH_PREFIX):
            response.headers["Cache-Control"] = "no-store"
            response.headers["Pragma"] = "no-cache"
        return response

    # Correlation id on every request/response, available to the audit writer.
    app.middleware("http")(request_id_middleware)

    register_exception_handlers(app)
    app.include_router(api_router, prefix=settings.API_V1_PREFIX)

    @app.get("/", include_in_schema=False)
    def root() -> dict[str, str]:
        return {
            "service": settings.SERVICE_NAME,
            "version": __version__,
            "docs": "/docs",
            "liveness": f"{settings.API_V1_PREFIX}/health/live",
            "readiness": f"{settings.API_V1_PREFIX}/health/ready",
        }

    return app


app = create_app()
