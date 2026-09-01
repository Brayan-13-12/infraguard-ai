"""ORM models package.

v0.2 introduces the first persistent entity: ``User``. The wider InfraGuard
domain (assets, services, dependencies, incidents) remains a later phase.
"""

from app.models.user import User

__all__ = ["User"]
