"""Authentication endpoints (v0.2).

* ``POST /api/v1/auth/register`` - create an account
* ``POST /api/v1/auth/login``    - issue an access-token cookie
* ``POST /api/v1/auth/logout``   - clear the access-token cookie
* ``GET  /api/v1/auth/me``       - the authenticated user's public profile
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from fastapi.exceptions import HTTPException
from sqlalchemy.orm import Session

from app.api.deps import (
    auth_rate_limiter,
    get_current_user,
    require_trusted_origin,
)
from app.core.config import settings
from app.core.security import create_access_token
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    UserPublic,
)
from app.services.users import EmailAlreadyRegistered, authenticate, create_user

router = APIRouter(prefix="/auth", tags=["auth"])

_INVALID_CREDENTIALS = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Invalid email or password",
    headers={"WWW-Authenticate": "Bearer"},
)


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.AUTH_COOKIE_NAME,
        value=token,
        max_age=settings.access_token_expires_seconds,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        path="/",
    )


def _clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.AUTH_COOKIE_NAME,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        path="/",
    )


@router.post(
    "/register",
    response_model=UserPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new account",
    responses={
        201: {"model": UserPublic},
        409: {"model": MessageResponse, "description": "Email already registered"},
        422: {"description": "Invalid email or password policy violation"},
        429: {"model": MessageResponse, "description": "Too many attempts"},
    },
    dependencies=[
        Depends(require_trusted_origin),
        Depends(auth_rate_limiter("register")),
    ],
)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> UserPublic:
    try:
        user = create_user(db, email=payload.email, password=payload.password)
    except EmailAlreadyRegistered:
        # ACCEPTED v0.2 TRADEOFF: an explicit "already registered" response lets an
        # attacker enumerate which emails have accounts. We keep it for portfolio
        # usability and do NOT redesign registration. Rate limiting (above) blunts
        # bulk enumeration. A production deployment would instead return a generic
        # "check your email" response and confirm/deny out of band. Documented in
        # backend/README.md and docs/architecture.md.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is already registered",
        ) from None
    db.commit()
    return UserPublic.model_validate(user)


@router.post(
    "/login",
    response_model=UserPublic,
    summary="Log in and receive an access-token cookie",
    responses={
        200: {"model": UserPublic},
        401: {"model": MessageResponse, "description": "Invalid credentials"},
        429: {"model": MessageResponse, "description": "Too many attempts"},
    },
    dependencies=[
        Depends(require_trusted_origin),
        Depends(auth_rate_limiter("login")),
    ],
)
def login(
    payload: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> UserPublic:
    user = authenticate(db, email=payload.email, password=payload.password)
    if user is None:
        raise _INVALID_CREDENTIALS

    token, _ = create_access_token(subject=str(user.id))
    _set_auth_cookie(response, token)
    db.commit()
    return UserPublic.model_validate(user)


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Log out (clears the access-token cookie)",
    dependencies=[Depends(require_trusted_origin)],
)
def logout(response: Response) -> MessageResponse:
    # Stateless JWTs are not revoked server-side (no denylist in v0.2): an
    # already-issued token stays cryptographically valid until it expires.
    _clear_auth_cookie(response)
    return MessageResponse(detail="Logged out")


@router.get(
    "/me",
    response_model=UserPublic,
    summary="Current authenticated user",
    responses={
        200: {"model": UserPublic},
        401: {"model": MessageResponse, "description": "Not authenticated"},
        403: {"model": MessageResponse, "description": "Inactive account"},
    },
)
def me(current_user: User = Depends(get_current_user)) -> UserPublic:
    return UserPublic.model_validate(current_user)
