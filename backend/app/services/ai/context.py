"""Resolve + RBAC-check an AI conversation's entity context.

A context id (``asset_id`` / ``incident_id``) always arrives from the frontend
(URL, banner). It is **never trusted**: this module re-fetches the entity, checks
the domain read permission, and only then exposes a small sanitized summary the
orchestrator grounds every turn on. A user cannot gain access to an asset /
incident by editing ``?asset_id=`` - they get "context unavailable" instead.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Literal

from sqlalchemy.orm import Session

from app.models.ai import AIConversation
from app.services.assets import get_asset
from app.services.incidents import get_incident_detail


@dataclass(frozen=True, slots=True)
class ResolvedContext:
    type: Literal["asset", "incident"]
    id: uuid.UUID
    label: str
    #: True when the caller can currently read it (permission + not trashed).
    available: bool
    #: Sanitized snapshot for grounding (only when ``available``).
    summary: dict[str, Any] | None = None


def resolve_context(
    db: Session,
    *,
    context_type: str | None,
    context_id: uuid.UUID | None,
    permissions: frozenset[str],
) -> ResolvedContext | None:
    if context_type is None or context_id is None:
        return None

    if context_type == "asset":
        if "assets.read" not in permissions:
            return ResolvedContext("asset", context_id, "Activo", available=False)
        asset = get_asset(db, context_id)
        if asset is None or asset.deleted_at is not None:
            return ResolvedContext("asset", context_id, "Activo", available=False)
        return ResolvedContext(
            "asset",
            context_id,
            asset.name,
            available=True,
            summary={
                "id": str(asset.id),
                "name": asset.name,
                "type": asset.asset_type,
                "environment": asset.environment,
                "criticality": asset.criticality,
                "status": asset.status,
                "is_active": asset.is_active,
                "owner": asset.owner,
            },
        )

    if context_type == "incident":
        if "incidents.read" not in permissions:
            return ResolvedContext("incident", context_id, "Incidente", available=False)
        detail = get_incident_detail(db, context_id)
        if detail is None or detail.incident.deleted_at is not None:
            return ResolvedContext("incident", context_id, "Incidente", available=False)
        inc = detail.incident
        return ResolvedContext(
            "incident",
            context_id,
            inc.title,
            available=True,
            summary={
                "id": str(inc.id),
                "title": inc.title,
                "severity": inc.severity,
                "status": inc.status,
                "priority": inc.priority,
                "affected_asset_count": len(detail.assets),
            },
        )

    return None


def resolve_conversation_context(
    db: Session, conversation: AIConversation, permissions: frozenset[str]
) -> ResolvedContext | None:
    return resolve_context(
        db,
        context_type=conversation.context_type,
        context_id=conversation.context_id,
        permissions=permissions,
    )
