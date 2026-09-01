"""User persistence and authentication logic.

Kept free of HTTP concerns so it is easy to unit-test and reuse.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password, needs_rehash, verify_password
from app.models.user import User


class EmailAlreadyRegistered(Exception):
    """Raised when registering an email that already exists."""


def get_by_email(db: Session, email: str) -> User | None:
    return db.execute(
        select(User).where(User.email == email.strip().lower())
    ).scalar_one_or_none()


def get_by_id(db: Session, user_id: uuid.UUID | str) -> User | None:
    if isinstance(user_id, str):
        try:
            user_id = uuid.UUID(user_id)
        except ValueError:
            return None
    return db.get(User, user_id)


def create_user(db: Session, *, email: str, password: str) -> User:
    """Create a user. Password is hashed here and never stored/logged in clear."""
    normalized = email.strip().lower()
    user = User(email=normalized, password_hash=hash_password(password))
    db.add(user)
    try:
        db.flush()
    except IntegrityError as exc:  # unique violation (race with a concurrent signup)
        db.rollback()
        raise EmailAlreadyRegistered from exc
    db.refresh(user)
    return user


def authenticate(db: Session, *, email: str, password: str) -> User | None:
    """Return the user on success, else ``None``.

    Runs a password verification even when the user does not exist so response
    timing does not reveal whether an email is registered. Inactive users fail
    authentication (callers must not distinguish this in responses).
    """
    user = get_by_email(db, email)
    password_matches = verify_password(password, user.password_hash if user else None)

    if user is None or not password_matches or not user.is_active:
        return None

    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
        db.add(user)
        db.flush()

    return user
