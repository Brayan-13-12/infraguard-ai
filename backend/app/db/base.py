"""Declarative base for SQLAlchemy ORM models.

The InfraGuard domain model is intentionally NOT defined in v0.1. This base
exists so Alembic has a metadata target and future models have a parent class.
"""

from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class for all ORM models."""


# Import models here as they are added so Alembic autogenerate can see them.
# e.g. from app.models.asset import Asset  # noqa: F401
