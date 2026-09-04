"""Asset relationship endpoints (Asset Relationships & Topology milestone).

* ``GET    /api/v1/relationships``            - paginated, filterable list
* ``POST   /api/v1/relationships``            - create an edge
* ``GET    /api/v1/relationships/types``      - the relationship-type catalog
* ``GET    /api/v1/relationships/{id}``       - one edge
* ``PATCH  /api/v1/relationships/{id}``       - update type / description
* ``DELETE /api/v1/relationships/{id}``       - real delete (not Trash - §14)

Authorization: ``relationships.read`` for reads, ``relationships.manage`` for
writes. See also ``GET /api/v1/assets/{id}/relationships`` (grouped
incoming/outgoing for one Asset) in ``app/api/v1/routes/assets.py``.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from fastapi.exceptions import HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permission, require_trusted_origin
from app.api.request_context import get_audit_context
from app.db.session import get_db
from app.models.audit import AuditAction, AuditEntityType
from app.models.relationship import RELATIONSHIP_TYPE_CATALOG, RelationshipType
from app.models.user import User
from app.schemas.relationship import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    AssetSummaryRead,
    MessageResponse,
    RelationshipCreate,
    RelationshipDetail,
    RelationshipPage,
    RelationshipSummary,
    RelationshipTypeCatalog,
    RelationshipTypeInfo,
    RelationshipUpdate,
)
from app.services.audit import AuditContext, FieldChange, diff_fields, record_event
from app.services.graph import sync as graph_sync
from app.services.relationships import (
    AssetNotFoundError,
    AssetTrashedError,
    DuplicateRelationshipError,
    RelationshipQuery,
    create_relationship,
    delete_relationship,
    get_relationship,
    global_summary,
    list_relationships,
    update_relationship,
)

router = APIRouter(
    prefix="/relationships",
    tags=["relationships"],
    dependencies=[Depends(get_current_user)],
)

_CAN_READ = Depends(require_permission("relationships.read"))
_CAN_MANAGE = Depends(require_permission("relationships.manage"))

_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Relationship not found")


def _detail(rel, source, target) -> RelationshipDetail:
    return RelationshipDetail(
        id=rel.id,
        source_asset_id=rel.source_asset_id,
        target_asset_id=rel.target_asset_id,
        relationship_type=rel.relationship_type,
        description=rel.description,
        created_at=rel.created_at,
        updated_at=rel.updated_at,
        source=AssetSummaryRead.model_validate(source),
        target=AssetSummaryRead.model_validate(target),
    )


def _edge_label(source, target, relationship_type: str) -> str:
    meta = RELATIONSHIP_TYPE_CATALOG.get(relationship_type)
    verb = meta.label_es if meta else relationship_type
    return f"{source.name} {verb} {target.name}"


@router.get("/types", response_model=RelationshipTypeCatalog, summary="Relationship-type catalog")
def relationship_types_endpoint() -> RelationshipTypeCatalog:
    return RelationshipTypeCatalog(
        types=[
            RelationshipTypeInfo(
                code=m.code,
                label=m.label_es,
                inverse_label=m.inverse_label_es,
                description=m.description_es,
                category=m.category,
                propagates_impact=m.propagates_impact,
            )
            for m in RELATIONSHIP_TYPE_CATALOG.values()
        ]
    )


@router.get(
    "", response_model=RelationshipPage, summary="List relationships", dependencies=[_CAN_READ]
)
def list_relationships_endpoint(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    source_asset_id: uuid.UUID | None = Query(None),
    target_asset_id: uuid.UUID | None = Query(None),
    asset_id: uuid.UUID | None = Query(None, description="Either endpoint"),
    direction: str = Query("both", pattern="^(both|outgoing|incoming)$"),
    relationship_type: list[RelationshipType] | None = Query(None, description="Repeatable"),
    environment: str | None = Query(
        None, description="Other endpoint if asset_id is set, else either endpoint"
    ),
    criticality: str | None = Query(
        None, description="Other endpoint if asset_id is set, else either endpoint"
    ),
    asset_type: str | None = Query(
        None, description="Other endpoint if asset_id is set, else either endpoint"
    ),
    search: str | None = Query(
        None,
        max_length=200,
        description="Matches source/target name, hostname, or the relationship description",
    ),
) -> RelationshipPage:
    query = RelationshipQuery(
        source_asset_id=source_asset_id,
        target_asset_id=target_asset_id,
        asset_id=asset_id,
        direction=direction,
        relationship_type=tuple(relationship_type or ()),
        environment=environment,
        criticality=criticality,
        asset_type=asset_type,
        search=search,
        page=page,
        page_size=page_size,
    )
    rows, total = list_relationships(db, query)
    total_pages = (total + page_size - 1) // page_size if total else 0
    return RelationshipPage(
        items=[_detail(*row) for row in rows],
        page=page,
        page_size=page_size,
        total=total,
        total_pages=total_pages,
    )


@router.get(
    "/summary",
    response_model=RelationshipSummary,
    summary="Global relationship stats for the Dependencias module",
    dependencies=[_CAN_READ],
)
def relationship_summary_endpoint(db: Session = Depends(get_db)) -> RelationshipSummary:
    return RelationshipSummary(**global_summary(db))


@router.post(
    "",
    response_model=RelationshipDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Create a relationship",
    responses={
        404: {"model": MessageResponse, "description": "Source or target asset not found"},
        409: {
            "model": MessageResponse,
            "description": "Duplicate edge, or an endpoint is in Trash",
        },
        422: {"description": "Validation error"},
    },
    dependencies=[Depends(require_trusted_origin), _CAN_MANAGE],
)
def create_relationship_endpoint(
    payload: RelationshipCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ctx: AuditContext = Depends(get_audit_context),
) -> RelationshipDetail:
    try:
        rel = create_relationship(db, payload, created_by=current_user.id)
    except AssetNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Source or target asset not found"
        ) from exc
    except AssetTrashedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot create a relationship against an asset in Trash",
        ) from exc
    except DuplicateRelationshipError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    detail = get_relationship(db, rel.id)
    assert detail is not None
    _, source, target = detail
    record_event(
        db,
        ctx=ctx,
        action=AuditAction.CREATE,
        entity_type=AuditEntityType.RELATIONSHIP,
        entity_id=rel.id,
        entity_label=_edge_label(source, target, rel.relationship_type),
        metadata={
            "relationship_type": rel.relationship_type,
            "source_asset_id": str(rel.source_asset_id),
            "source_asset_name": source.name,
            "target_asset_id": str(rel.target_asset_id),
            "target_asset_name": target.name,
        },
    )
    db.commit()
    graph_sync.upsert_edge(rel)  # best-effort - never blocks on Neo4j (§44)
    return _detail(*detail)


@router.get(
    "/{relationship_id}",
    response_model=RelationshipDetail,
    summary="Get a relationship",
    responses={404: {"model": MessageResponse}},
    dependencies=[_CAN_READ],
)
def get_relationship_endpoint(
    relationship_id: uuid.UUID, db: Session = Depends(get_db)
) -> RelationshipDetail:
    row = get_relationship(db, relationship_id)
    if row is None:
        raise _NOT_FOUND
    return _detail(*row)


@router.patch(
    "/{relationship_id}",
    response_model=RelationshipDetail,
    summary="Update a relationship (type / description only)",
    responses={
        404: {"model": MessageResponse},
        409: {"model": MessageResponse, "description": "Would duplicate an existing edge"},
        422: {"description": "Validation error"},
    },
    dependencies=[Depends(require_trusted_origin), _CAN_MANAGE],
)
def update_relationship_endpoint(
    relationship_id: uuid.UUID,
    payload: RelationshipUpdate,
    db: Session = Depends(get_db),
    ctx: AuditContext = Depends(get_audit_context),
) -> RelationshipDetail:
    row = get_relationship(db, relationship_id)
    if row is None:
        raise _NOT_FOUND
    rel, source, target = row
    before = {"relationship_type": rel.relationship_type, "description": rel.description}
    label_before = _edge_label(source, target, rel.relationship_type)

    try:
        rel = update_relationship(db, rel, payload)
    except DuplicateRelationshipError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    after = {"relationship_type": rel.relationship_type, "description": rel.description}
    changes = diff_fields(before, after, payload.model_dump(exclude_unset=True).keys())
    if changes:
        record_event(
            db,
            ctx=ctx,
            action=AuditAction.UPDATE,
            entity_type=AuditEntityType.RELATIONSHIP,
            entity_id=rel.id,
            entity_label=label_before,
            changes=[FieldChange(f.field, f.old, f.new) for f in changes],
        )
    db.commit()
    # Cypher relationship *types* are immutable in place - a type change needs
    # the old-typed edge removed before the new one is (re-)created. Cheap
    # no-op when only the description changed. Both best-effort (§44).
    graph_sync.remove_edge(relationship_id)
    graph_sync.upsert_edge(rel)
    refreshed = get_relationship(db, relationship_id)
    assert refreshed is not None
    return _detail(*refreshed)


@router.delete(
    "/{relationship_id}",
    response_model=MessageResponse,
    summary="Delete a relationship (real delete - not Trash)",
    responses={404: {"model": MessageResponse}},
    dependencies=[Depends(require_trusted_origin), _CAN_MANAGE],
)
def delete_relationship_endpoint(
    relationship_id: uuid.UUID,
    db: Session = Depends(get_db),
    ctx: AuditContext = Depends(get_audit_context),
) -> MessageResponse:
    row = get_relationship(db, relationship_id)
    if row is None:
        raise _NOT_FOUND
    rel, source, target = row
    label = _edge_label(source, target, rel.relationship_type)
    delete_relationship(db, rel)
    record_event(
        db,
        ctx=ctx,
        action=AuditAction.DELETE,
        entity_type=AuditEntityType.RELATIONSHIP,
        entity_id=relationship_id,
        entity_label=label,
        metadata={"relationship_type": rel.relationship_type},
    )
    db.commit()
    graph_sync.remove_edge(relationship_id)  # best-effort - never blocks on Neo4j (§44)
    return MessageResponse(detail="Relationship deleted")
