"""Single import site that ensures every ORM model is registered on
``Base.metadata``. Import this (not individual model modules) from Alembic and
from test fixtures that build the schema.
"""

from __future__ import annotations

from app.db.base import Base
from app.models import Asset, User

__all__ = ["Asset", "Base", "User"]
