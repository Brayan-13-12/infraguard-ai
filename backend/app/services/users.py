"""User persistence, email normalization and authentication logic.

Kept free of HTTP concerns so it is easy to unit-test and reuse.

Email identity
--------------
:func:`normalize_email` is the **one** canonical representation used everywhere
(request schemas, this service, the bootstrap-admin script). Combined with the
``UNIQUE`` constraint + ``lower(email)`` CHECK on :class:`~app.models.user.User`,
duplicate accounts are impossible - case-insensitively, whitespace-insensitively,
and even if a caller bypasses this service.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password, needs_rehash, verify_password
from app.models.user import AccountStatus, User


class EmailAlreadyRegistered(Exception):
    """Raised when registering an email that already has an account/request.

    The caller maps this to a **status-neutral** ``409`` - the response must not
    reveal whether the existing account is pending, active, rejected or disabled.
    """


def normalize_email(raw: str) -> str:
    """The canonical form of an email address for identity purposes.

    Trim surrounding whitespace and lowercase the whole address. Local parts are
    technically case-sensitive per RFC 5321, but for a login identity treating
    ``User@x`` and ``user@x`` as the same account is the safe, expected behaviour
    (and matches every mainstream provider). Applied server-side; never trusted
    from the client.
    """
    return raw.strip().lower()


def get_by_email(db: Session, email: str) -> User | None:
    return db.execute(
        select(User).where(User.email == normalize_email(email))
    ).scalar_one_or_none()


def get_by_id(db: Session, user_id: uuid.UUID | str) -> User | None:
    if isinstance(user_id, str):
        try:
            user_id = uuid.UUID(user_id)
        except ValueError:
            return None
    return db.get(User, user_id)


def create_user(
    db: Session,
    *,
    email: str,
    password: str,
    account_status: AccountStatus = AccountStatus.PENDING,
) -> User:
    """Create a user. Password is hashed here and never stored/logged in clear.

    Defaults to ``account_status=pending`` - a public registration is an **access
    request**, not an account, until an administrator approves it. The
    bootstrap-admin path passes ``account_status=active``.

    Uniqueness is enforced twice: an explicit pre-check (fast, friendly error)
    **and** the database ``UNIQUE`` constraint (authoritative, race-proof).
    """
    normalized = normalize_email(email)
    if get_by_email(db, normalized) is not None:
        raise EmailAlreadyRegistered
    user = User(
        email=normalized,
        password_hash=hash_password(password),
        account_status=account_status.value,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError as exc:  # unique violation (race with a concurrent signup)
        db.rollback()
        raise EmailAlreadyRegistered from exc
    db.refresh(user)
    return user


def authenticate(db: Session, *, email: str, password: str) -> User | None:
    """Return the user when the **credentials** are valid, else ``None``.

    This checks *only* the password (running a dummy verification for an unknown
    email so response timing does not reveal whether an address is registered).
    The account **lifecycle** (pending / rejected / disabled) is deliberately
    *not* checked here - the login route inspects ``user.account_status`` and
    returns the appropriate state, so a correctly-authenticated pending account
    never gets a generic "invalid password" response.
    """
    user = get_by_email(db, email)
    password_matches = verify_password(password, user.password_hash if user else None)
    if user is None or not password_matches:
        return None

    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
        db.add(user)
        db.flush()
    return user
