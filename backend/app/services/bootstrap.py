"""Safe, explicit bootstrap of the first Administrator.

Public registration can **never** create an Administrator (or even an active
account). The only ways an account gains the Administrator role are:

* this bootstrap (an operator running an explicit command with env-supplied
  credentials), or
* an already-authorized administrator granting it through ``/admin``.

:func:`ensure_bootstrap_admin` is idempotent: it creates the account only if the
email is absent, and if it already exists it activates + promotes it **without
touching the password**. It never logs the password.
"""

from __future__ import annotations

from dataclasses import dataclass

from email_validator import EmailNotValidError, validate_email
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models.user import AccountStatus, User
from app.services.rbac import (
    ADMIN_ROLE_SLUG,
    grant_roles,
    role_by_slug,
    seed_rbac,
    user_has_admin_role,
)
from app.services.users import get_by_email, normalize_email

_MIN_LEN = settings.PASSWORD_MIN_LENGTH
_MAX_LEN = settings.PASSWORD_MAX_LENGTH


class BootstrapError(RuntimeError):
    """Raised for a missing/weak bootstrap configuration."""


@dataclass(frozen=True, slots=True)
class BootstrapResult:
    email: str
    created: bool
    promoted: bool
    activated: bool
    account_status: str


def _validate_email(email: str) -> str:
    """Normalize + validate against the same rules the auth API enforces, so a
    bootstrapped account can actually log in."""
    try:
        result = validate_email(email.strip(), check_deliverability=False)
    except EmailNotValidError as exc:
        raise BootstrapError(f"BOOTSTRAP_ADMIN_EMAIL is not a valid email: {exc}") from exc
    return normalize_email(result.normalized)


def _validate_password(password: str) -> None:
    if not password or not password.strip():
        raise BootstrapError("BOOTSTRAP_ADMIN_PASSWORD must not be blank")
    if not (_MIN_LEN <= len(password) <= _MAX_LEN):
        raise BootstrapError(
            f"BOOTSTRAP_ADMIN_PASSWORD must be {_MIN_LEN}-{_MAX_LEN} characters"
        )


def ensure_bootstrap_admin(
    db: Session, *, email: str | None, password: str | None
) -> BootstrapResult:
    """Create or promote the bootstrap Administrator. Does **not** commit.

    * ``email`` absent            -> :class:`BootstrapError`.
    * account absent              -> create it (``active``, Argon2 hash, roles).
    * account present             -> ensure ``active`` + Administrator; the
                                     password is left exactly as it was.
    """
    if not email or not email.strip():
        raise BootstrapError("BOOTSTRAP_ADMIN_EMAIL is not configured")
    if password is None:
        raise BootstrapError("BOOTSTRAP_ADMIN_PASSWORD is not configured")
    _validate_password(password)

    normalized = _validate_email(email)

    seed_rbac(db)  # make sure the system roles exist
    admin_role = role_by_slug(db, ADMIN_ROLE_SLUG)
    if admin_role is None:  # pragma: no cover - seed_rbac guarantees it
        raise BootstrapError("the Administrator role is missing (RBAC not seeded)")

    user = get_by_email(db, normalized)
    created = False
    activated = False
    promoted = False

    if user is None:
        user = User(
            email=normalized,
            password_hash=hash_password(password),
            account_status=AccountStatus.ACTIVE.value,
        )
        db.add(user)
        db.flush()
        created = True
    else:
        if user.account_status != AccountStatus.ACTIVE.value:
            user.account_status = AccountStatus.ACTIVE.value
            activated = True
        promoted = not user_has_admin_role(db, user.id)

    grant_roles(
        db, user_id=user.id, role_ids=[admin_role.id], assigned_by=user.id
    )
    db.flush()

    return BootstrapResult(
        email=normalized,
        created=created,
        promoted=promoted,
        activated=activated,
        account_status=user.account_status,
    )
