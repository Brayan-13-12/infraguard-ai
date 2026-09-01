"""Shared FastAPI dependencies for the API layer.

* ``get_current_user``     - authenticate a request (cookie or Bearer header)
* ``require_trusted_origin`` - CSRF defense for cookie-authenticated unsafe methods
* ``auth_rate_limiter``    - best-effort in-process brute-force protection
"""

from __future__ import annotations

from collections.abc import Callable
from urllib.parse import urlparse

from fastapi import Depends, Request, status
from fastapi.exceptions import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.ratelimit import RateLimiter
from app.core.security import TokenError, decode_access_token
from app.db.session import get_db
from app.models.user import User
from app.services.users import get_by_id

_UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

_CREDENTIALS_EXCEPTION = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)

# One limiter per sensitive bucket. Module-level so state persists across requests.
_LIMITERS: dict[str, RateLimiter] = {}


def _limiter(bucket: str) -> RateLimiter:
    if bucket not in _LIMITERS:
        _LIMITERS[bucket] = RateLimiter(
            max_attempts=settings.AUTH_RATE_LIMIT_MAX_ATTEMPTS,
            window_seconds=settings.AUTH_RATE_LIMIT_WINDOW_SECONDS,
        )
    return _LIMITERS[bucket]


def reset_rate_limiters() -> None:
    """Test helper - clear all in-process counters."""
    for limiter in _LIMITERS.values():
        limiter.reset()


def auth_rate_limiter(bucket: str) -> Callable[[Request], None]:
    def _dependency(request: Request) -> None:
        client = request.client.host if request.client else "unknown"
        allowed, retry_after = _limiter(bucket).check(f"{bucket}:{client}")
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many attempts. Please wait and try again.",
                headers={"Retry-After": str(retry_after)},
            )

    return _dependency


def _origin_allowed(value: str | None) -> bool:
    if not value:
        return False
    parsed = urlparse(value)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    return origin in settings.BACKEND_CORS_ORIGINS


def require_trusted_origin(request: Request) -> None:
    """Reject cross-site state-changing requests (CSRF defense in depth).

    Combined with the ``SameSite=Lax`` auth cookie and the restrictive CORS
    policy. Non-browser clients (no ``Origin``/``Referer``) are allowed through.
    """
    if request.method not in _UNSAFE_METHODS:
        return

    origin = request.headers.get("origin")
    referer = request.headers.get("referer")

    if origin is None and referer is None:
        return  # not a browser-driven cross-site request

    checked = origin if origin is not None else referer
    if not _origin_allowed(checked):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cross-origin request rejected",
        )


def _extract_token(request: Request) -> str | None:
    cookie = request.cookies.get(settings.AUTH_COOKIE_NAME)
    if cookie:
        return cookie
    header = request.headers.get("authorization")
    if header and header.lower().startswith("bearer "):
        return header[7:].strip()
    return None


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    """Resolve the authenticated, active user or raise 401/403.

    Reusable for every future protected endpoint.
    """
    token = _extract_token(request)
    if not token:
        raise _CREDENTIALS_EXCEPTION

    try:
        claims = decode_access_token(token)
    except TokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user = get_by_id(db, claims["sub"])
    if user is None:
        raise _CREDENTIALS_EXCEPTION
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )
    return user
