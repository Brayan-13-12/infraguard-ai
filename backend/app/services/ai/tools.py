"""The allow-listed, read-only AI tool layer.

Every tool:

* has an explicit Pydantic input model (bounded strings, page sizes, validated
  enums / UUIDs) - the model / provider can never hand-craft a query;
* declares the **domain permission** it requires - :class:`ToolExecutor`
  refuses to run it otherwise, so "a Viewer cannot read Audit by asking AI";
* returns a :class:`ToolResult` with a bounded, JSON-safe, sanitized ``data``
  payload plus the evidence + entity references the answer is grounded on;
* **cannot mutate anything** - it only calls existing read services.

There is no generic "call any service" or "run SQL" capability.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.asset import Asset, AssetStatus, Criticality, Environment
from app.models.incident import (
    Incident,
    IncidentAsset,
    IncidentPriority,
    IncidentSeverity,
    IncidentStatus,
)
from app.schemas.ai import AIEntityRef, AIEvidenceItem
from app.services.assets import AssetQuery, get_asset, get_asset_summary, list_assets
from app.services.audit import (
    AuditQuery,
    get_audit_event,
    list_audit_events,
)
from app.services.incidents import (
    IncidentQuery,
    get_incident_detail,
    get_incident_summary,
    list_incidents,
)

_LIMIT = settings.AI_MAX_TOOL_RESULTS
_QUERY_MAX = 120


# --------------------------------------------------------------------------
# Errors
# --------------------------------------------------------------------------


class ToolError(Exception):
    """Base for tool-layer failures (surfaced to the provider, not the client)."""


class UnknownToolError(ToolError):
    pass


class ToolPermissionError(ToolError):
    """The caller lacks the domain permission a tool requires."""

    def __init__(self, tool_name: str, permission: str) -> None:
        super().__init__(
            f"tool {tool_name!r} requires the {permission!r} permission, which you do not hold"
        )
        self.tool_name = tool_name
        self.permission = permission


class ToolInputError(ToolError):
    pass


# --------------------------------------------------------------------------
# Result
# --------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ToolResult:
    #: Compact JSON-safe payload the provider grounds its answer on.
    data: dict[str, Any]
    #: One "source" line for the answer's evidence panel.
    evidence: AIEvidenceItem
    #: Entities the answer references (rendered as native cards by the UI).
    entities: list[AIEntityRef] = field(default_factory=list)


# --------------------------------------------------------------------------
# Serialization (whitelist only - no user / secret fields ever)
# --------------------------------------------------------------------------


def _asset_dict(a: Asset, *, open_incidents: int | None = None) -> dict[str, Any]:
    d: dict[str, Any] = {
        "id": str(a.id),
        "name": a.name,
        "type": a.asset_type,
        "environment": a.environment,
        "criticality": a.criticality,
        "status": a.status,
        "is_active": a.is_active,
        "hostname": a.hostname,
        "owner": a.owner,
    }
    if open_incidents is not None:
        d["open_incidents"] = open_incidents
    return d


def _incident_dict(i: Incident, *, affected: int | None = None) -> dict[str, Any]:
    d: dict[str, Any] = {
        "id": str(i.id),
        "title": i.title,
        "severity": i.severity,
        "status": i.status,
        "priority": i.priority,
        "owner": i.owner,
        "started_at": i.started_at.isoformat() if i.started_at else None,
        "resolved_at": i.resolved_at.isoformat() if i.resolved_at else None,
    }
    if affected is not None:
        d["affected_asset_count"] = affected
    return d


def _asset_entity(a: Asset) -> AIEntityRef:
    return AIEntityRef(type="asset", id=str(a.id), label=a.name)


def _incident_entity(i: Incident) -> AIEntityRef:
    return AIEntityRef(type="incident", id=str(i.id), label=i.title)


def _open_incident_counts(db: Session, asset_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    """One query: active-incident count per asset (bounded input set)."""
    if not asset_ids:
        return {}
    active = [
        s.value for s in IncidentStatus if s not in (IncidentStatus.RESOLVED, IncidentStatus.CLOSED)
    ]
    rows = db.execute(
        select(IncidentAsset.asset_id, func.count())
        .join(Incident, Incident.id == IncidentAsset.incident_id)
        .where(
            IncidentAsset.asset_id.in_(asset_ids),
            Incident.deleted_at.is_(None),
            Incident.status.in_(active),
        )
        .group_by(IncidentAsset.asset_id)
    ).all()
    return {row[0]: int(row[1]) for row in rows}


# --------------------------------------------------------------------------
# Input models
# --------------------------------------------------------------------------


class _NoArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SearchAssetsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str | None = Field(default=None, max_length=_QUERY_MAX)
    criticality: list[Criticality] = Field(default_factory=list, max_length=4)
    environment: Environment | None = None
    status: list[AssetStatus] = Field(default_factory=list, max_length=4)
    is_active: bool | None = None
    limit: int = Field(default=_LIMIT, ge=1, le=_LIMIT)


class GetAssetInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    asset_id: uuid.UUID


class SearchIncidentsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str | None = Field(default=None, max_length=_QUERY_MAX)
    severity: list[IncidentSeverity] = Field(default_factory=list, max_length=4)
    status: list[IncidentStatus] = Field(default_factory=list, max_length=6)
    priority: list[IncidentPriority] = Field(default_factory=list, max_length=4)
    asset_id: uuid.UUID | None = None
    limit: int = Field(default=_LIMIT, ge=1, le=_LIMIT)


class GetIncidentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    incident_id: uuid.UUID


class SearchAuditInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str | None = Field(default=None, max_length=_QUERY_MAX)
    action: list[str] = Field(default_factory=list, max_length=6)
    entity_type: list[str] = Field(default_factory=list, max_length=6)
    entity_id: str | None = Field(default=None, max_length=64)
    limit: int = Field(default=_LIMIT, ge=1, le=_LIMIT)


class GetAuditEventInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    event_id: uuid.UUID


# --------------------------------------------------------------------------
# Tool implementations
# --------------------------------------------------------------------------


def _t_search_assets(db: Session, p: SearchAssetsInput) -> ToolResult:
    rows, total = list_assets(
        db,
        AssetQuery(
            search=p.query,
            environment=p.environment,
            criticality=tuple(p.criticality),
            status=tuple(p.status),
            is_active=p.is_active,
            page=1,
            page_size=p.limit,
        ),
    )
    counts = _open_incident_counts(db, [a.id for a in rows])
    items = [_asset_dict(a, open_incidents=counts.get(a.id, 0)) for a in rows]
    return ToolResult(
        data={"total": total, "returned": len(items), "assets": items},
        evidence=AIEvidenceItem(source="assets", label="Activos", count=total),
        entities=[_asset_entity(a) for a in rows[:8]],
    )


def _t_get_asset(db: Session, p: GetAssetInput) -> ToolResult:
    asset = get_asset(db, p.asset_id)
    if asset is None or asset.deleted_at is not None:
        return ToolResult(
            data={"found": False, "asset_id": str(p.asset_id)},
            evidence=AIEvidenceItem(source="assets", label="Activo", count=0),
        )
    counts = _open_incident_counts(db, [asset.id])
    return ToolResult(
        data={"found": True, "asset": _asset_dict(asset, open_incidents=counts.get(asset.id, 0))},
        evidence=AIEvidenceItem(source="assets", label="Activo", count=1),
        entities=[_asset_entity(asset)],
    )


def _t_summarize_assets(db: Session, _p: _NoArgs) -> ToolResult:
    summary = get_asset_summary(db)
    return ToolResult(
        data=summary,
        evidence=AIEvidenceItem(
            source="assets", label="Resumen de activos", count=int(summary["total"])
        ),
    )


def _t_search_incidents(db: Session, p: SearchIncidentsInput) -> ToolResult:
    rows, total = list_incidents(
        db,
        IncidentQuery(
            search=p.query,
            severity=tuple(p.severity),
            status=tuple(p.status),
            priority=tuple(p.priority),
            asset_id=p.asset_id,
            sort="severity",
            page=1,
            page_size=p.limit,
        ),
    )
    items = [_incident_dict(i, affected=n) for i, n in rows]
    return ToolResult(
        data={"total": total, "returned": len(items), "incidents": items},
        evidence=AIEvidenceItem(source="incidents", label="Incidentes", count=total),
        entities=[_incident_entity(i) for i, _ in rows[:8]],
    )


def _t_get_incident(db: Session, p: GetIncidentInput) -> ToolResult:
    detail = get_incident_detail(db, p.incident_id)
    if detail is None or detail.incident.deleted_at is not None:
        return ToolResult(
            data={"found": False, "incident_id": str(p.incident_id)},
            evidence=AIEvidenceItem(source="incidents", label="Incidente", count=0),
        )
    inc = detail.incident
    data = _incident_dict(inc, affected=len(detail.assets))
    data["description"] = (inc.description or "")[:1200]
    data["affected_assets"] = [_asset_dict(a) for a in detail.assets[:_LIMIT]]
    return ToolResult(
        data={"found": True, "incident": data},
        evidence=AIEvidenceItem(source="incidents", label="Incidente", count=1),
        entities=[_incident_entity(inc), *[_asset_entity(a) for a in detail.assets[:6]]],
    )


def _t_summarize_incidents(db: Session, _p: _NoArgs) -> ToolResult:
    summary = get_incident_summary(db)
    return ToolResult(
        data=summary,
        evidence=AIEvidenceItem(
            source="incidents", label="Resumen de incidentes", count=int(summary["total"])
        ),
    )


def _t_get_incident_timeline(db: Session, p: GetIncidentInput) -> ToolResult:
    detail = get_incident_detail(db, p.incident_id)
    if detail is None or detail.incident.deleted_at is not None:
        return ToolResult(
            data={"found": False, "incident_id": str(p.incident_id)},
            evidence=AIEvidenceItem(source="incident_timeline", label="Cronología", count=0),
        )
    events = [
        {
            "type": ev.type,
            "message": ev.message[:500],
            "at": ev.created_at.isoformat(),
        }
        for ev, _actor in detail.timeline[:_LIMIT]
    ]
    return ToolResult(
        data={
            "found": True,
            "incident_id": str(detail.incident.id),
            "title": detail.incident.title,
            "status": detail.incident.status,
            "events": events,
        },
        evidence=AIEvidenceItem(
            source="incident_timeline", label="Cronología del incidente", count=len(events)
        ),
        entities=[_incident_entity(detail.incident)],
    )


def _t_search_audit(db: Session, p: SearchAuditInput) -> ToolResult:
    rows, total = list_audit_events(
        db,
        AuditQuery(
            search=p.query,
            action=tuple(p.action),
            entity_type=tuple(p.entity_type),
            entity_id=p.entity_id,
            page=1,
            page_size=p.limit,
        ),
    )
    items = [
        {
            "id": str(r.event.id),
            "action": r.event.action,
            "entity_type": r.event.entity_type,
            "entity_label": r.event.entity_label,
            "actor_email": r.event.actor_email,
            "occurred_at": r.event.occurred_at.isoformat(),
            "change_count": r.change_count,
        }
        for r in rows
    ]
    return ToolResult(
        data={"total": total, "returned": len(items), "events": items},
        evidence=AIEvidenceItem(source="audit", label="Eventos de auditoría", count=total),
        entities=[
            AIEntityRef(
                type="audit_event",
                id=str(r.event.id),
                label=(r.event.entity_label or r.event.action),
            )
            for r in rows[:6]
        ],
    )


def _t_get_audit_event(db: Session, p: GetAuditEventInput) -> ToolResult:
    found = get_audit_event(db, p.event_id)
    if found is None:
        return ToolResult(
            data={"found": False, "event_id": str(p.event_id)},
            evidence=AIEvidenceItem(source="audit", label="Evento de auditoría", count=0),
        )
    event, changes = found
    return ToolResult(
        data={
            "found": True,
            "event": {
                "id": str(event.id),
                "action": event.action,
                "entity_type": event.entity_type,
                "entity_label": event.entity_label,
                "actor_email": event.actor_email,
                "occurred_at": event.occurred_at.isoformat(),
                "changes": [
                    {"field": c.field_name, "from": c.old_value, "to": c.new_value}
                    for c in changes[:_LIMIT]
                ],
            },
        },
        evidence=AIEvidenceItem(source="audit", label="Evento de auditoría", count=1),
        entities=[
            AIEntityRef(
                type="audit_event", id=str(event.id), label=(event.entity_label or event.action)
            )
        ],
    )


def _t_get_dashboard_overview(db: Session, _p: _NoArgs) -> ToolResult:
    """Combined asset + incident snapshot. Registered under ``assets.read``;
    a caller who also holds ``incidents.read`` gets the incident half too."""
    assets = get_asset_summary(db)
    data: dict[str, Any] = {"assets": assets}
    total = int(assets["total"])
    return ToolResult(
        data=data,
        evidence=AIEvidenceItem(
            source="dashboard", label="Panorama de infraestructura", count=total
        ),
    )


# --------------------------------------------------------------------------
# Registry
# --------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class Tool:
    name: str
    description: str
    permission: str
    input_model: type[BaseModel]
    run: Callable[[Session, Any], ToolResult]


REGISTRY: dict[str, Tool] = {
    t.name: t
    for t in (
        Tool(
            "search_assets",
            "Search / filter assets (name, criticality, environment, status).",
            "assets.read",
            SearchAssetsInput,
            _t_search_assets,
        ),
        Tool(
            "get_asset",
            "Get one asset by id, with its open-incident count.",
            "assets.read",
            GetAssetInput,
            _t_get_asset,
        ),
        Tool(
            "summarize_assets",
            "Aggregate asset counts by criticality, status, environment and type.",
            "assets.read",
            _NoArgs,
            _t_summarize_assets,
        ),
        Tool(
            "search_incidents",
            "Search / filter incidents (title, severity, status, priority, affected asset).",
            "incidents.read",
            SearchIncidentsInput,
            _t_search_incidents,
        ),
        Tool(
            "get_incident",
            "Get one incident by id, with its affected assets.",
            "incidents.read",
            GetIncidentInput,
            _t_get_incident,
        ),
        Tool(
            "summarize_incidents",
            "Aggregate incident counts by severity and status, plus open / critical / recent.",
            "incidents.read",
            _NoArgs,
            _t_summarize_incidents,
        ),
        Tool(
            "get_incident_timeline",
            "Get the persisted timeline of one incident.",
            "incidents.read",
            GetIncidentInput,
            _t_get_incident_timeline,
        ),
        Tool(
            "search_audit",
            "Search the system audit log (action, entity type, entity id).",
            "audit.read",
            SearchAuditInput,
            _t_search_audit,
        ),
        Tool(
            "get_audit_event",
            "Get one audit event by id, with its field changes.",
            "audit.read",
            GetAuditEventInput,
            _t_get_audit_event,
        ),
        Tool(
            "get_dashboard_overview",
            "High-level infrastructure snapshot (asset totals and distribution).",
            "assets.read",
            _NoArgs,
            _t_get_dashboard_overview,
        ),
    )
}


# --------------------------------------------------------------------------
# Executor - the authorization boundary
# --------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ToolCall:
    name: str
    result: ToolResult


class ToolExecutor:
    """Runs registered tools for one turn. Enforces the domain permission on
    **every** call, validates input, and records what ran (for evidence)."""

    def __init__(self, db: Session, permissions: frozenset[str]) -> None:
        self._db = db
        self._permissions = permissions
        self.calls: list[ToolCall] = []

    def available(self) -> list[Tool]:
        return [t for t in REGISTRY.values() if t.permission in self._permissions]

    def can(self, name: str) -> bool:
        tool = REGISTRY.get(name)
        return tool is not None and tool.permission in self._permissions

    def call(self, name: str, params: dict[str, Any] | None = None) -> ToolResult:
        tool = REGISTRY.get(name)
        if tool is None:
            raise UnknownToolError(f"unknown tool {name!r}")
        if tool.permission not in self._permissions:
            raise ToolPermissionError(name, tool.permission)
        try:
            validated = tool.input_model.model_validate(params or {})
        except ValidationError as exc:
            raise ToolInputError(f"invalid input for {name!r}: {exc.errors()!r}") from exc
        result = tool.run(self._db, validated)
        self.calls.append(ToolCall(name, result))
        return result

    # -- evidence aggregation -------------------------------------------------

    def collected_evidence(self) -> list[AIEvidenceItem]:
        seen: dict[str, AIEvidenceItem] = {}
        for c in self.calls:
            ev = c.result.evidence
            key = f"{ev.source}:{ev.label}"
            if key not in seen or ev.count > seen[key].count:
                seen[key] = ev
        return list(seen.values())

    def collected_entities(self, limit: int = 12) -> list[AIEntityRef]:
        seen: dict[str, AIEntityRef] = {}
        for c in self.calls:
            for e in c.result.entities:
                seen.setdefault(f"{e.type}:{e.id}", e)
        return list(seen.values())[:limit]
