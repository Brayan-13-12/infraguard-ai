"""Application-wide exception handlers.

Keeps error responses generic and free of reflected request data: no SQL text,
stack traces, connection strings, secrets - and, critically, **no raw input
values** (Pydantic's default 422 body echoes the submitted value, which for a
password field is the plaintext password). Detail is logged server-side only.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import InterfaceError, OperationalError

logger = logging.getLogger(__name__)

# The only keys we ever echo back from a validation error. In particular we drop
# `input` (the raw submitted value) and `ctx` (which can also carry it).
_SAFE_VALIDATION_KEYS = ("type", "loc", "msg")


async def _validation_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    safe_detail = [
        {key: err[key] for key in _SAFE_VALIDATION_KEYS if key in err}
        for err in exc.errors()
    ]
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": safe_detail},
    )


async def _database_unavailable(request: Request, exc: Exception) -> JSONResponse:
    logger.warning(
        "Database unavailable handling %s %s",
        request.method,
        request.url.path,
        exc_info=True,
    )
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"detail": "Service temporarily unavailable. Please try again shortly."},
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(OperationalError, _database_unavailable)
    app.add_exception_handler(InterfaceError, _database_unavailable)
