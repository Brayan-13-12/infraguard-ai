"""The ``User`` entity - the first persistent domain model (v0.2).

Deliberately minimal: identity + credentials + activation + timestamps. Roles,
permissions, organizations and profiles are later phases.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, String, func, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("char_length(email) > 0", name="email_not_empty"),
        CheckConstraint("email = lower(email)", name="email_lowercase"),
        CheckConstraint("char_length(password_hash) > 0", name="password_hash_not_empty"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    # `unique=True` creates a named UNIQUE constraint (uq_users_email); PostgreSQL
    # backs it with an index, so lookups by email are fast too.
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    def __repr__(self) -> str:  # pragma: no cover - debug aid, no secrets
        return f"<User id={self.id!s} active={self.is_active}>"
