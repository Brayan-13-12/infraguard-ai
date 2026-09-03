"""Read-only Audit Log endpoints (Governance & Administration - Phase 1).

* ``GET /api/v1/audit``           - paginated, searchable, filterable list (newest first)
* ``GET /api/v1/audit/summary``   - compact "activity today" counters
* ``GET /api/v1/audit/{id}``      - one event: actor + entity + request context + field changes

**Append-only:** there is deliberately **no** create / update / delete endpoint.
Audit rows are written internally by :func:`app.services.audit.record_event` in
the same transaction as the mutation they describe. Application-level append-only
is not cryptographic immutability - a database administrator can still mutate
rows directly.

**Authorization (RBAC):** every endpoint requires an authenticated, active user
**and** the ``audit.read`` permission. Authentication alone is no longer
sufficient - an authenticated caller without ``audit.read`` gets ``403``.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query, status
from fastapi.exceptions import HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permission
from app.db.session import get_db
from app.schemas.audit import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    AuditAction,
    AuditChangeRead,
    AuditEntityType,
    AuditEventListItem,
    AuditEventRead,
    AuditPage,
    AuditSummary,
    MessageResponse,
)
from app.services.audit import (
    AuditQuery,
    audit_summary,
    get_audit_event,
    list_audit_events,
)

router = APIRouter(
    prefix="/audit",
    tags=["audit"],
    dependencies=[Depends(get_current_user), Depends(require_permission("audit.read"))],
)

_NOT_FOUND = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND, detail="Audit event not found"
)


@router.get("", response_model=AuditPage, summary="List audit events (newest first)")
def list_audit_endpoint(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    q: str | None = Query(None, max_length=200, description="Match actor / entity / action"),
    action: list[AuditAction] | None = Query(None, description="Repeatable"),
    entity_type: list[AuditEntityType] | None = Query(None, description="Repeatable"),
    actor: str | None = Query(None, max_length=320, description="Actor email (contains)"),
    entity_id: str | None = Query(None, max_length=64),
    occurred_from: datetime | None = Query(None, alias="from"),
    occurred_to: datetime | None = Query(None, alias="to"),
) -> AuditPage:
    query = AuditQuery(
        search=q,
        action=tuple(a.value for a in action or ()),
        entity_type=tuple(e.value for e in entity_type or ()),
        actor=actor,
        entity_id=entity_id,
        occurred_from=occurred_from,
        occurred_to=occurred_to,
        page=page,
        page_size=page_size,
    )
    rows, total = list_audit_events(db, query)
    total_pages = (total + page_size - 1) // page_size if total else 0
    return AuditPage(
        items=[
            AuditEventListItem(
                id=row.event.id,
                occurred_at=row.event.occurred_at,
                action=row.event.action,
                entity_type=row.event.entity_type,
                entity_id=row.event.entity_id,
                entity_label=row.event.entity_label,
                actor_user_id=row.event.actor_user_id,
                actor_email=row.event.actor_email,
                change_count=row.change_count,
                change_preview=[
                    AuditChangeRead.model_validate(c) for c in row.change_preview
                ],
            )
            for row in rows
        ],
        page=page,
        page_size=page_size,
        total=total,
        total_pages=total_pages,
    )


@router.get(
    "/summary",
    response_model=AuditSummary,
    summary="Compact audit activity counters for today",
)
def audit_summary_endpoint(db: Session = Depends(get_db)) -> AuditSummary:
    # Declared before ``/{event_id}`` so "summary" is not captured as a UUID path.
    return AuditSummary.model_validate(audit_summary(db))


@router.get(
    "/{event_id}",
    response_model=AuditEventRead,
    summary="Get one audit event with its field changes",
    responses={404: {"model": MessageResponse}},
)
def get_audit_endpoint(
    event_id: uuid.UUID, db: Session = Depends(get_db)
) -> AuditEventRead:
    found = get_audit_event(db, event_id)
    if found is None:
        raise _NOT_FOUND
    event, changes = found
    return AuditEventRead(
        id=event.id,
        occurred_at=event.occurred_at,
        action=event.action,
        entity_type=event.entity_type,
        entity_id=event.entity_id,
        entity_label=event.entity_label,
        actor_user_id=event.actor_user_id,
        actor_email=event.actor_email,
        request_id=event.request_id,
        ip_address=event.ip_address,
        user_agent=event.user_agent,
        metadata=event.event_metadata,
        changes=[AuditChangeRead.model_validate(c) for c in changes],
    )
