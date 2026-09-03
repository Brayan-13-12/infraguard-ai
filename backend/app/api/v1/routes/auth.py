"""Authentication endpoints (v0.2 + Governance Phase 3 access-request flow).

* ``POST /api/v1/auth/register`` - submit an **access request** (creates a
  ``pending`` account with no roles - it cannot sign in until an administrator
  approves it)
* ``POST /api/v1/auth/login``    - issue an access-token cookie for an ``active``
  account; a status-specific ``403`` for ``pending`` / ``rejected`` / ``disabled``
* ``POST /api/v1/auth/logout``   - clear the access-token cookie
* ``GET  /api/v1/auth/me``       - the authenticated user's identity + effective
  authorization
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.exceptions import HTTPException
from sqlalchemy.orm import Session

from app.api.deps import (
    _extract_token,
    auth_rate_limiter,
    get_current_permissions,
    get_current_user,
    require_trusted_origin,
)
from app.api.request_context import RequestContext, get_request_context
from app.core.config import settings
from app.core.security import TokenError, create_access_token, decode_access_token
from app.db.session import get_db
from app.models.audit import AuditAction, AuditEntityType
from app.models.user import AccountStatus, User
from app.schemas.auth import (
    AccessRequestResponse,
    CurrentUser,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    RoleRef,
    UserPublic,
)
from app.services.audit import AuditContext, record_event
from app.services.rbac import get_roles_for_user
from app.services.users import EmailAlreadyRegistered, authenticate, create_user, get_by_id

router = APIRouter(prefix="/auth", tags=["auth"])

_INVALID_CREDENTIALS = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Invalid email or password",
    headers={"WWW-Authenticate": "Bearer"},
)

# Status-neutral: the same 409 whether the email belongs to a pending, active,
# rejected or disabled account - never reveal which.
_EMAIL_TAKEN = HTTPException(
    status_code=status.HTTP_409_CONFLICT,
    detail="An account or access request already exists for this email.",
)

#: Login states for a correctly-authenticated but non-active account. The
#: frontend keys off ``detail.code``; the message stays generic and safe.
_LOGIN_STATE_RESPONSE: dict[AccountStatus, tuple[str, str]] = {
    AccountStatus.PENDING: (
        "account_pending",
        "Your access request is pending administrator approval.",
    ),
    AccountStatus.REJECTED: (
        "account_rejected",
        "Your access request was not approved. Contact an administrator.",
    ),
    AccountStatus.DISABLED: (
        "account_disabled",
        "Your account has been disabled. Contact an administrator.",
    ),
}


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


def _auth_ctx(user: User, ctx: RequestContext) -> AuditContext:
    return AuditContext(
        actor_user_id=user.id,
        actor_email=user.email,
        request_id=ctx.request_id,
        ip_address=ctx.ip_address,
        user_agent=ctx.user_agent,
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
    response_model=AccessRequestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit an access request",
    responses={
        201: {"model": AccessRequestResponse},
        409: {"model": MessageResponse, "description": "Email already in use"},
        422: {"description": "Invalid email or password policy violation"},
        429: {"model": MessageResponse, "description": "Too many attempts"},
    },
    dependencies=[
        Depends(require_trusted_origin),
        Depends(auth_rate_limiter("register")),
    ],
)
def register(
    payload: RegisterRequest,
    db: Session = Depends(get_db),
    ctx: RequestContext = Depends(get_request_context),
) -> AccessRequestResponse:
    """Create a **pending** account (no roles). Public registration can never
    grant access - an administrator must approve the request first."""
    try:
        user = create_user(db, email=payload.email, password=payload.password)
    except EmailAlreadyRegistered:
        raise _EMAIL_TAKEN from None

    record_event(
        db,
        ctx=_auth_ctx(user, ctx),
        action=AuditAction.CREATE,
        entity_type=AuditEntityType.USER,
        entity_id=user.id,
        entity_label=user.email,
        metadata={"account_status": user.account_status, "via": "registration"},
    )
    db.commit()
    return AccessRequestResponse(
        detail="Access request submitted. An administrator must approve it before you can sign in.",
        account_status=user.account_status,
    )


@router.post(
    "/login",
    response_model=UserPublic,
    summary="Log in and receive an access-token cookie",
    responses={
        200: {"model": UserPublic},
        401: {"model": MessageResponse, "description": "Invalid credentials"},
        403: {"description": "Account pending / rejected / disabled"},
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
    ctx: RequestContext = Depends(get_request_context),
) -> UserPublic:
    user = authenticate(db, email=payload.email, password=payload.password)
    if user is None:
        raise _INVALID_CREDENTIALS

    status_ = AccountStatus(user.account_status)
    if status_ is not AccountStatus.ACTIVE:
        # Credentials were valid - reveal the lifecycle state (but not why), so the
        # UI can show "pending approval" instead of a misleading "wrong password".
        code, message = _LOGIN_STATE_RESPONSE[status_]
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": code, "message": message},
        )

    token, _ = create_access_token(subject=str(user.id))
    _set_auth_cookie(response, token)
    record_event(
        db,
        ctx=_auth_ctx(user, ctx),
        action=AuditAction.LOGIN,
        entity_type=AuditEntityType.AUTHENTICATION,
        entity_id=str(user.id),
        entity_label=user.email,
    )
    db.commit()
    return UserPublic.model_validate(user)


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Log out (clears the access-token cookie)",
    dependencies=[Depends(require_trusted_origin)],
)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    ctx: RequestContext = Depends(get_request_context),
) -> MessageResponse:
    # Stateless JWTs are not revoked server-side (no denylist): an already-issued
    # token stays cryptographically valid until it expires. Logout stays usable
    # even without a valid session, so the audit event is best-effort: only a
    # currently-valid session produces a LOGOUT record.
    token = _extract_token(request)
    if token:
        try:
            claims = decode_access_token(token)
            user = get_by_id(db, claims["sub"])
        except (TokenError, KeyError):
            user = None
        if user is not None:
            record_event(
                db,
                ctx=_auth_ctx(user, ctx),
                action=AuditAction.LOGOUT,
                entity_type=AuditEntityType.AUTHENTICATION,
                entity_id=str(user.id),
                entity_label=user.email,
            )
            db.commit()

    _clear_auth_cookie(response)
    return MessageResponse(detail="Logged out")


@router.get(
    "/me",
    response_model=CurrentUser,
    summary="Current authenticated user (identity + effective authorization)",
    responses={
        200: {"model": CurrentUser},
        401: {"model": MessageResponse, "description": "Not authenticated"},
        403: {"description": "Account no longer active"},
    },
)
def me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    permissions: frozenset[str] = Depends(get_current_permissions),
) -> CurrentUser:
    roles = get_roles_for_user(db, current_user.id)
    return CurrentUser(
        id=current_user.id,
        email=current_user.email,
        is_active=current_user.is_active,
        account_status=current_user.account_status,
        created_at=current_user.created_at,
        roles=[RoleRef.model_validate(r) for r in roles],
        permissions=sorted(permissions),
    )
