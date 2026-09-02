"""Incident management endpoints.

* ``GET   /api/v1/incidents``                 - paginated, searchable, filterable list
* ``GET   /api/v1/incidents/summary``         - aggregate counts for the dashboard
* ``GET   /api/v1/incidents/{id}``            - one incident: detail + assets + timeline
* ``POST  /api/v1/incidents``                 - create (+ CREATED / ASSET_ADDED events)
* ``PATCH /api/v1/incidents/{id}``            - partial update (+ change events)
* ``POST  /api/v1/incidents/{id}/resolve``    - move to Resolved (idempotent)
* ``POST  /api/v1/incidents/{id}/reopen``     - move a terminal incident back to Open
* ``POST  /api/v1/incidents/{id}/comments``   - append a COMMENT timeline entry

Every endpoint requires an authenticated, active user (``get_current_user`` at
the router level). State-changing methods additionally pass the CSRF origin
check. ``created_by`` / actor identity is always taken from the authenticated
user - never from the request body.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query, status
from fastapi.exceptions import HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_trusted_origin
from app.db.session import get_db
from app.models.incident import IncidentPriority, IncidentSeverity, IncidentStatus
from app.models.user import User
from app.schemas.incident import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    IncidentAssetRef,
    IncidentCommentCreate,
    IncidentCreate,
    IncidentEventRead,
    IncidentListItem,
    IncidentPage,
    IncidentRead,
    IncidentSummary,
    IncidentUpdate,
    MessageResponse,
)
from app.services.incidents import (
    IncidentDetail,
    IncidentQuery,
    add_comment,
    create_incident,
    existing_asset_ids,
    get_incident,
    get_incident_detail,
    get_incident_summary,
    list_incidents,
    reopen_incident,
    resolve_incident,
    update_incident,
)

router = APIRouter(
    prefix="/incidents",
    tags=["incidents"],
    dependencies=[Depends(get_current_user)],
)

_NOT_FOUND = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found"
)

_SORTS = ("recent", "oldest", "started", "severity")


def _load(db: Session, incident_id: uuid.UUID):
    incident = get_incident(db, incident_id)
    if incident is None:
        raise _NOT_FOUND
    return incident


def _validate_asset_ids(db: Session, ids: list[uuid.UUID]) -> None:
    if not ids:
        return
    known = existing_asset_ids(db, ids)
    if any(i not in known for i in ids):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[
                {
                    "type": "value_error",
                    "loc": ["body", "asset_ids"],
                    "msg": "one or more selected assets do not exist",
                }
            ],
        )


def _list_item(incident, count: int) -> IncidentListItem:
    return IncidentListItem(
        id=incident.id,
        title=incident.title,
        severity=incident.severity,
        status=incident.status,
        priority=incident.priority,
        owner=incident.owner,
        started_at=incident.started_at,
        detected_at=incident.detected_at,
        resolved_at=incident.resolved_at,
        affected_asset_count=count,
        created_at=incident.created_at,
        updated_at=incident.updated_at,
    )


def _incident_read(detail: IncidentDetail) -> IncidentRead:
    inc = detail.incident
    return IncidentRead(
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
        affected_assets=[IncidentAssetRef.model_validate(a) for a in detail.assets],
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


def _detail_or_404(db: Session, incident_id: uuid.UUID) -> IncidentRead:
    detail = get_incident_detail(db, incident_id)
    if detail is None:
        raise _NOT_FOUND
    return _incident_read(detail)


@router.get("", response_model=IncidentPage, summary="List incidents")
def list_incidents_endpoint(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    q: str | None = Query(None, max_length=200, description="Search title/description/owner"),
    severity: list[IncidentSeverity] | None = Query(None, description="Repeatable"),
    status_filter: list[IncidentStatus] | None = Query(
        None, alias="status", description="Repeatable"
    ),
    priority: list[IncidentPriority] | None = Query(None, description="Repeatable"),
    asset_id: uuid.UUID | None = Query(None, description="Incidents affecting this asset"),
    started_from: datetime | None = Query(None),
    started_to: datetime | None = Query(None),
    sort: str = Query("recent"),
) -> IncidentPage:
    if sort not in _SORTS:
        sort = "recent"
    query = IncidentQuery(
        search=q,
        severity=tuple(severity or ()),
        status=tuple(status_filter or ()),
        priority=tuple(priority or ()),
        asset_id=asset_id,
        started_from=started_from,
        started_to=started_to,
        sort=sort,
        page=page,
        page_size=page_size,
    )
    rows, total = list_incidents(db, query)
    total_pages = (total + page_size - 1) // page_size if total else 0
    return IncidentPage(
        items=[_list_item(inc, count) for inc, count in rows],
        page=page,
        page_size=page_size,
        total=total,
        total_pages=total_pages,
    )


@router.get(
    "/summary",
    response_model=IncidentSummary,
    summary="Aggregate incident counts for the dashboard",
)
def incident_summary_endpoint(db: Session = Depends(get_db)) -> IncidentSummary:
    # Declared before ``/{incident_id}`` so "summary" is not captured as a UUID.
    return IncidentSummary.model_validate(get_incident_summary(db))


@router.get(
    "/{incident_id}",
    response_model=IncidentRead,
    summary="Get an incident (detail, affected assets, timeline)",
    responses={404: {"model": MessageResponse}},
)
def get_incident_endpoint(
    incident_id: uuid.UUID, db: Session = Depends(get_db)
) -> IncidentRead:
    return _detail_or_404(db, incident_id)


@router.post(
    "",
    response_model=IncidentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create an incident",
    responses={422: {"description": "Validation error"}},
    dependencies=[Depends(require_trusted_origin)],
)
def create_incident_endpoint(
    payload: IncidentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> IncidentRead:
    _validate_asset_ids(db, payload.asset_ids)
    incident = create_incident(db, payload, actor=current_user)
    db.commit()
    return _detail_or_404(db, incident.id)


@router.patch(
    "/{incident_id}",
    response_model=IncidentRead,
    summary="Update an incident (partial)",
    responses={404: {"model": MessageResponse}, 422: {"description": "Validation error"}},
    dependencies=[Depends(require_trusted_origin)],
)
def update_incident_endpoint(
    incident_id: uuid.UUID,
    payload: IncidentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> IncidentRead:
    incident = _load(db, incident_id)
    if payload.asset_ids is not None:
        _validate_asset_ids(db, payload.asset_ids)
    update_incident(db, incident, payload, actor=current_user)
    db.commit()
    return _detail_or_404(db, incident_id)


@router.post(
    "/{incident_id}/resolve",
    response_model=IncidentRead,
    summary="Resolve an incident (idempotent)",
    responses={404: {"model": MessageResponse}},
    dependencies=[Depends(require_trusted_origin)],
)
def resolve_incident_endpoint(
    incident_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> IncidentRead:
    resolve_incident(db, _load(db, incident_id), actor=current_user)
    db.commit()
    return _detail_or_404(db, incident_id)


@router.post(
    "/{incident_id}/reopen",
    response_model=IncidentRead,
    summary="Reopen a resolved/closed incident",
    responses={404: {"model": MessageResponse}},
    dependencies=[Depends(require_trusted_origin)],
)
def reopen_incident_endpoint(
    incident_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> IncidentRead:
    reopen_incident(db, _load(db, incident_id), actor=current_user)
    db.commit()
    return _detail_or_404(db, incident_id)


@router.post(
    "/{incident_id}/comments",
    response_model=IncidentEventRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add a comment to the incident timeline",
    responses={404: {"model": MessageResponse}, 422: {"description": "Validation error"}},
    dependencies=[Depends(require_trusted_origin)],
)
def add_comment_endpoint(
    incident_id: uuid.UUID,
    payload: IncidentCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> IncidentEventRead:
    event = add_comment(
        db, _load(db, incident_id), payload.message, actor=current_user
    )
    db.commit()
    return IncidentEventRead(
        id=event.id,
        type=event.type,
        message=event.message,
        created_by=event.created_by,
        actor_email=current_user.email,
        created_at=event.created_at,
    )
