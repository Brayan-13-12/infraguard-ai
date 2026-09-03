"""The ``User`` entity - identity, credentials and **account lifecycle**.

Account lifecycle (Governance Phase 3 - access-request flow)
-----------------------------------------------------------
Public registration no longer grants access. Every account moves through an
explicit :class:`AccountStatus`:

* ``pending``  - a registration / access request awaiting an administrator.
                 The account **cannot authenticate**.
* ``active``   - approved (or bootstrapped); authenticates normally, subject to
                 its RBAC roles.
* ``rejected`` - an administrator declined the request. Cannot authenticate. The
                 row is kept (history + it blocks re-registration of the email).
* ``disabled`` - an administrator suspended an active account. Cannot
                 authenticate. Reversible.

``account_status`` is the **single source of truth**. ``is_active`` is a
read-only convenience (``account_status == active``) kept for response schemas;
every SQL filter uses ``account_status`` directly.

``email`` is stored in its canonical normalized form (see
:func:`app.services.users.normalize_email`): trimmed + lowercased. A ``UNIQUE``
constraint + a ``lower(email)`` CHECK make duplicate accounts impossible at the
database layer, independent of the application.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, String, func, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AccountStatus(enum.StrEnum):
    """The lifecycle state of a user account."""

    PENDING = "pending"
    ACTIVE = "active"
    REJECTED = "rejected"
    DISABLED = "disabled"


#: States from which an administrator toggles the *runtime* enable/disable axis
#: (``PATCH /admin/users/{id}`` with ``is_active``). PENDING / REJECTED accounts
#: go through the dedicated approve / reject endpoints instead.
TOGGLEABLE_STATUSES: frozenset[AccountStatus] = frozenset(
    {AccountStatus.ACTIVE, AccountStatus.DISABLED}
)

_ACCOUNT_STATUS_IN = ", ".join(f"'{s.value}'" for s in AccountStatus)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("char_length(email) > 0", name="email_not_empty"),
        CheckConstraint("email = lower(email)", name="email_lowercase"),
        CheckConstraint("char_length(password_hash) > 0", name="password_hash_not_empty"),
        CheckConstraint(
            f"account_status IN ({_ACCOUNT_STATUS_IN})", name="account_status_valid"
        ),
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
    account_status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'pending'")
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

    @property
    def is_active(self) -> bool:
        """``True`` only for an ``active`` account. Read-only; the lifecycle is
        driven through ``account_status``. Kept so response schemas (``UserPublic``,
        ``CurrentUser`` …) can expose a simple boolean."""
        return self.account_status == AccountStatus.ACTIVE.value

    def __repr__(self) -> str:  # pragma: no cover - debug aid, no secrets
        return f"<User id={self.id!s} status={self.account_status}>"
