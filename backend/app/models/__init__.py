"""ORM models package.

* v0.2 - ``User`` (authentication & identity).
* Assets milestone - ``Asset`` (infrastructure inventory), the first
  business-domain entity.
"""

from app.models.asset import (
    Asset,
    AssetStatus,
    AssetType,
    Criticality,
    Environment,
)
from app.models.user import User

__all__ = [
    "Asset",
    "AssetStatus",
    "AssetType",
    "Criticality",
    "Environment",
    "User",
]
