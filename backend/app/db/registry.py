"""Single import site that ensures every ORM model is registered on
``Base.metadata``. Import this (not individual model modules) from Alembic and
from test fixtures that build the schema.
"""

from __future__ import annotations

from app.db.base import Base
from app.models import Asset, Incident, IncidentAsset, IncidentEvent, User

__all__ = ["Asset", "Base", "Incident", "IncidentAsset", "IncidentEvent", "User"]
