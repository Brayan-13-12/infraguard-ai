"""Trash / Restore endpoints (Governance & Administration - Phase 2).

A **dedicated read path** for soft-deleted records - deliberately separate from
the operational Asset / Incident APIs so nothing leaks a trashed record into a
normal list.

* ``GET  /api/v1/trash/summary``                     - ``{assets, incidents}`` counters
* ``GET  /api/v1/trash/assets``                      - trashed assets (paginated, filterable)
* ``GET  /api/v1/trash/assets/{id}``                 - one trashed asset (read-only detail)
* ``POST /api/v1/trash/assets/{id}/restore``         - restore -> reappears in Assets
* ``GET  /api/v1/trash/incidents``                   - trashed incidents (paginated, filterable)
* ``GET  /api/v1/trash/incidents/{id}``              - one trashed incident (+ preserved timeline)
* ``POST /api/v1/trash/incidents/{id}/restore``      - restore -> reappears in Incidents

Authorization (RBAC): reading Trash (summary / lists / detail) requires
``trash.read``; restoring requires ``trash.restore``. Moving something *to*
Trash stays a domain capability (``assets.delete`` / ``incidents.delete``) on the
Asset / Incident APIs - ``trash.restore`` never deletes. There is **no permanent
purge**; ``trash.purge`` is reserved for a future RBAC-gated "empty Trash".
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query, status
from fastapi.exceptions import HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permission, require_trusted_origin
from app.api.request_context import get_audit_context
from app.db.session import get_db
from app.models.asset import AssetType, Criticality
from app.models.audit import AuditAction, AuditEntityType
from app.models.incident import IncidentSeverity, IncidentStatus
from app.schemas.asset import MessageResponse
from app.schemas.incident import IncidentEventRead
from app.schemas.trash import (
    ASSETS_DEFAULT_PAGE_SIZE,
    INCIDENTS_DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    TrashAssetDetail,
    TrashAssetListItem,
    TrashAssetPage,
    TrashIncidentAssetRef,
    TrashIncidentDetail,
    TrashIncidentListItem,
    TrashIncidentPage,
    TrashSummary,
)
from app.services.audit import AuditContext, record_event
from app.services.graph import sync as graph_sync
from app.services.trash import (
    TrashAssetQuery,
    TrashIncidentQuery,
    get_trashed_asset,
    get_trashed_incident_detail,
    list_trashed_assets,
    list_trashed_incidents,
    restore_asset,
    restore_incident,
    trash_summary,
)

router = APIRouter(
    prefix="/trash",
    tags=["trash"],
    dependencies=[Depends(get_current_user), Depends(require_permission("trash.read"))],
)

_CAN_RESTORE = Depends(require_permission("trash.restore"))

_ASSET_NOT_FOUND = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND, detail="No trashed asset with that id"
)
_INCIDENT_NOT_FOUND = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND, detail="No trashed incident with that id"
)


def _total_pages(total: int, page_size: int) -> int:
    return (total + page_size - 1) // page_size if total else 0


# --------------------------------------------------------------------------
# Summary
# --------------------------------------------------------------------------


@router.get("/summary", response_model=TrashSummary, summary="Trash item counts")
def trash_summary_endpoint(db: Session = Depends(get_db)) -> TrashSummary:
    return TrashSummary.model_validate(trash_summary(db))


# --------------------------------------------------------------------------
# Assets
# --------------------------------------------------------------------------


@router.get("/assets", response_model=TrashAssetPage, summary="List trashed assets")
def list_trash_assets_endpoint(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(ASSETS_DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    q: str | None = Query(None, max_length=200),
    asset_type: AssetType | None = Query(None, alias="type"),
    criticality: list[Criticality] | None = Query(None, description="Repeatable"),
    deleted_by: str | None = Query(None, max_length=320, description="Deleter email (contains)"),
    deleted_from: datetime | None = Query(None, alias="from"),
    deleted_to: datetime | None = Query(None, alias="to"),
) -> TrashAssetPage:
    query = TrashAssetQuery(
        search=q,
        asset_type=asset_type,
        criticality=tuple(criticality or ()),
        deleted_by=deleted_by,
        deleted_from=deleted_from,
        deleted_to=deleted_to,
        page=page,
        page_size=page_size,
    )
    rows, total = list_trashed_assets(db, query)
    return TrashAssetPage(
        items=[
            TrashAssetListItem(
                id=asset.id,
                name=asset.name,
                asset_type=asset.asset_type,
                environment=asset.environment,
                criticality=asset.criticality,
                status=asset.status,
                deleted_at=asset.deleted_at,
                deleted_by=asset.deleted_by,
                deleted_by_email=email,
            )
            for asset, email in rows
        ],
        page=page,
        page_size=page_size,
        total=total,
        total_pages=_total_pages(total, page_size),
    )


@router.get(
    "/assets/{asset_id}",
    response_model=TrashAssetDetail,
    summary="Get a trashed asset (read-only)",
    responses={404: {"model": MessageResponse}},
)
def get_trash_asset_endpoint(
    asset_id: uuid.UUID, db: Session = Depends(get_db)
) -> TrashAssetDetail:
    found = get_trashed_asset(db, asset_id)
    if found is None:
        raise _ASSET_NOT_FOUND
    asset, email = found
    return TrashAssetDetail(
        id=asset.id,
        name=asset.name,
        asset_type=asset.asset_type,
        environment=asset.environment,
        criticality=asset.criticality,
        status=asset.status,
        hostname=asset.hostname,
        ip_address=asset.ip_address,
        owner=asset.owner,
        description=asset.description,
        is_active=asset.is_active,
        created_at=asset.created_at,
        updated_at=asset.updated_at,
        deleted_at=asset.deleted_at,
        deleted_by=asset.deleted_by,
        deleted_by_email=email,
    )


@router.post(
    "/assets/{asset_id}/restore",
    response_model=MessageResponse,
    summary="Restore a trashed asset",
    responses={404: {"model": MessageResponse}},
    dependencies=[Depends(require_trusted_origin), _CAN_RESTORE],
)
def restore_asset_endpoint(
    asset_id: uuid.UUID,
    db: Session = Depends(get_db),
    ctx: AuditContext = Depends(get_audit_context),
) -> MessageResponse:
    found = get_trashed_asset(db, asset_id)
    if found is None:
        raise _ASSET_NOT_FOUND
    asset, _ = found

    restore_asset(db, asset)
    record_event(
        db,
        ctx=ctx,
        action=AuditAction.RESTORE,
        entity_type=AuditEntityType.ASSET,
        entity_id=asset.id,
        entity_label=asset.name,
    )
    db.commit()
    graph_sync.upsert_asset(asset)  # best-effort - un-hides it + its edges in Neo4j
    return MessageResponse(detail="Asset restored")


# --------------------------------------------------------------------------
# Incidents
# --------------------------------------------------------------------------


@router.get("/incidents", response_model=TrashIncidentPage, summary="List trashed incidents")
def list_trash_incidents_endpoint(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(INCIDENTS_DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    q: str | None = Query(None, max_length=200),
    severity: list[IncidentSeverity] | None = Query(None, description="Repeatable"),
    status_filter: list[IncidentStatus] | None = Query(
        None, alias="status", description="Repeatable"
    ),
    deleted_by: str | None = Query(None, max_length=320),
    deleted_from: datetime | None = Query(None, alias="from"),
    deleted_to: datetime | None = Query(None, alias="to"),
) -> TrashIncidentPage:
    query = TrashIncidentQuery(
        search=q,
        severity=tuple(severity or ()),
        status=tuple(status_filter or ()),
        deleted_by=deleted_by,
        deleted_from=deleted_from,
        deleted_to=deleted_to,
        page=page,
        page_size=page_size,
    )
    rows, total = list_trashed_incidents(db, query)
    return TrashIncidentPage(
        items=[
            TrashIncidentListItem(
                id=inc.id,
                title=inc.title,
                severity=inc.severity,
                status=inc.status,
                priority=inc.priority,
                owner=inc.owner,
                affected_asset_count=count,
                deleted_at=inc.deleted_at,
                deleted_by=inc.deleted_by,
                deleted_by_email=email,
            )
            for inc, email, count in rows
        ],
        page=page,
        page_size=page_size,
        total=total,
        total_pages=_total_pages(total, page_size),
    )


@router.get(
    "/incidents/{incident_id}",
    response_model=TrashIncidentDetail,
    summary="Get a trashed incident (read-only, with preserved timeline)",
    responses={404: {"model": MessageResponse}},
)
def get_trash_incident_endpoint(
    incident_id: uuid.UUID, db: Session = Depends(get_db)
) -> TrashIncidentDetail:
    found = get_trashed_incident_detail(db, incident_id)
    if found is None:
        raise _INCIDENT_NOT_FOUND
    detail, email = found
    inc = detail.incident
    return TrashIncidentDetail(
        id=inc.id,
        title=inc.title,
        description=inc.description,
        severity=inc.severity,
        status=inc.status,
        priority=inc.priority,
        owner=inc.owner,
        started_at=inc.started_at,
        detected_at=inc.detected_at,
        resolved_at=inc.resolved_at,
        created_by=inc.created_by,
        created_at=inc.created_at,
        updated_at=inc.updated_at,
        deleted_at=inc.deleted_at,
        deleted_by=inc.deleted_by,
        deleted_by_email=email,
        affected_assets=[
            TrashIncidentAssetRef.model_validate(a) for a in detail.assets
        ],
        timeline=[
            IncidentEventRead(
                id=event.id,
                type=event.type,
                message=event.message,
                created_by=event.created_by,
                actor_email=actor_email,
                created_at=event.created_at,
            )
            for event, actor_email in detail.timeline
        ],
    )


@router.post(
    "/incidents/{incident_id}/restore",
    response_model=MessageResponse,
    summary="Restore a trashed incident",
    responses={404: {"model": MessageResponse}},
    dependencies=[Depends(require_trusted_origin), _CAN_RESTORE],
)
def restore_incident_endpoint(
    incident_id: uuid.UUID,
    db: Session = Depends(get_db),
    ctx: AuditContext = Depends(get_audit_context),
) -> MessageResponse:
    found = get_trashed_incident_detail(db, incident_id)
    if found is None:
        raise _INCIDENT_NOT_FOUND
    incident = found[0].incident

    restore_incident(db, incident)
    record_event(
        db,
        ctx=ctx,
        action=AuditAction.RESTORE,
        entity_type=AuditEntityType.INCIDENT,
        entity_id=incident.id,
        entity_label=incident.title,
    )
    db.commit()
    return MessageResponse(detail="Incident restored")
