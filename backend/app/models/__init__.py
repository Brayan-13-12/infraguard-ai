"""ORM models package.

* v0.2 - ``User`` (authentication & identity).
* Assets milestone - ``Asset`` (infrastructure inventory), the first
  business-domain entity.
* Incidents milestone (v0.5) - ``Incident``, the ``incident_assets`` association
  and the ``IncidentEvent`` timeline.
* Asset Relationships & Topology milestone - ``AssetRelationship``, the
  canonical directed edge between two Assets (PostgreSQL is authoritative;
  Neo4j is a derived projection - see ``app/services/graph/``).
"""

from app.models.ai import (
    AIContextType,
    AIConversation,
    AIMessage,
    AIMessageRole,
)
from app.models.asset import (
    Asset,
    AssetStatus,
    AssetType,
    Criticality,
    Environment,
)
from app.models.audit import (
    AuditAction,
    AuditChange,
    AuditEntityType,
    AuditEvent,
)
from app.models.incident import (
    Incident,
    IncidentAsset,
    IncidentEvent,
    IncidentEventType,
    IncidentPriority,
    IncidentSeverity,
    IncidentStatus,
)
from app.models.rbac import (
    Permission,
    Role,
    RolePermission,
    UserRole,
)
from app.models.relationship import AssetRelationship, RelationshipType
from app.models.user import AccountStatus, User

__all__ = [
    "AIContextType",
    "AIConversation",
    "AIMessage",
    "AIMessageRole",
    "AccountStatus",
    "Asset",
    "AssetRelationship",
    "AssetStatus",
    "AssetType",
    "AuditAction",
    "AuditChange",
    "AuditEntityType",
    "AuditEvent",
    "Criticality",
    "Environment",
    "Incident",
    "IncidentAsset",
    "IncidentEvent",
    "IncidentEventType",
    "IncidentPriority",
    "IncidentSeverity",
    "IncidentStatus",
    "Permission",
    "RelationshipType",
    "Role",
    "RolePermission",
    "User",
    "UserRole",
]
