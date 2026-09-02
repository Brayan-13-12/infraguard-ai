"""Asset inventory endpoints.

* ``GET    /api/v1/assets``                 - paginated, searchable, filterable list
* ``GET    /api/v1/assets/{id}``            - a single asset
* ``POST   /api/v1/assets``                 - create
* ``PATCH  /api/v1/assets/{id}``            - partial update (content only)
* ``POST   /api/v1/assets/{id}/deactivate`` - soft-deactivate (idempotent)
* ``POST   /api/v1/assets/{id}/reactivate`` - reactivate (idempotent)

Every endpoint requires an authenticated, active user (``get_current_user`` at
the router level). State-changing methods additionally pass the CSRF
origin check. There is **no destructive delete** in this milestone - an asset is
deactivated and stays queryable with ``is_active=false``.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from fastapi.exceptions import HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_trusted_origin
from app.api.request_context import get_audit_context
from app.db.session import get_db
from app.models.asset import Asset, AssetStatus, AssetType, Criticality, Environment
from app.models.audit import AuditAction, AuditEntityType
from app.schemas.asset import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    AssetCreate,
    AssetPage,
    AssetRead,
    AssetSummary,
    AssetUpdate,
    MessageResponse,
)
from app.services.assets import (
    AssetQuery,
    create_asset,
    get_asset,
    get_asset_summary,
    list_assets,
    set_active,
    update_asset,
)
from app.services.audit import AuditContext, FieldChange, diff_fields, record_event

router = APIRouter(
    prefix="/assets",
    tags=["assets"],
    dependencies=[Depends(get_current_user)],
)

_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

# Fields whose change is worth recording in the audit log.
_AUDITED_ASSET_FIELDS = (
    "name",
    "asset_type",
    "environment",
    "criticality",
    "status",
    "hostname",
    "ip_address",
    "owner",
    "description",
)


def _load(db: Session, asset_id: uuid.UUID):
    asset = get_asset(db, asset_id)
    if asset is None:
        raise _NOT_FOUND
    return asset


def _asset_audit_snapshot(asset: Asset) -> dict[str, object]:
    return {f: getattr(asset, f) for f in _AUDITED_ASSET_FIELDS}


@router.get("", response_model=AssetPage, summary="List assets")
def list_assets_endpoint(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    q: str | None = Query(None, max_length=200, description="Search name/hostname/owner/IP"),
    asset_type: AssetType | None = Query(None),
    environment: Environment | None = Query(None),
    criticality: list[Criticality] | None = Query(None, description="Repeatable"),
    status_filter: list[AssetStatus] | None = Query(None, alias="status", description="Repeatable"),
    is_active: bool | None = Query(None),
) -> AssetPage:
    query = AssetQuery(
        search=q,
        asset_type=asset_type,
        environment=environment,
        criticality=tuple(criticality or ()),
        status=tuple(status_filter or ()),
        is_active=is_active,
        page=page,
        page_size=page_size,
    )
    items, total = list_assets(db, query)
    total_pages = (total + page_size - 1) // page_size if total else 0
    return AssetPage(
        items=[AssetRead.model_validate(a) for a in items],
        page=page,
        page_size=page_size,
        total=total,
        total_pages=total_pages,
    )


@router.get(
    "/summary",
    response_model=AssetSummary,
    summary="Aggregate asset counts for the dashboard",
)
def asset_summary_endpoint(db: Session = Depends(get_db)) -> AssetSummary:
    # Declared before ``/{asset_id}`` so "summary" is not captured as a UUID path.
    return AssetSummary.model_validate(get_asset_summary(db))


@router.get(
    "/{asset_id}",
    response_model=AssetRead,
    summary="Get an asset",
    responses={404: {"model": MessageResponse}},
)
def get_asset_endpoint(asset_id: uuid.UUID, db: Session = Depends(get_db)) -> AssetRead:
    return AssetRead.model_validate(_load(db, asset_id))


@router.post(
    "",
    response_model=AssetRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create an asset",
    responses={422: {"description": "Validation error"}},
    dependencies=[Depends(require_trusted_origin)],
)
def create_asset_endpoint(
    payload: AssetCreate,
    db: Session = Depends(get_db),
    ctx: AuditContext = Depends(get_audit_context),
) -> AssetRead:
    asset = create_asset(db, payload)
    record_event(
        db,
        ctx=ctx,
        action=AuditAction.CREATE,
        entity_type=AuditEntityType.ASSET,
        entity_id=asset.id,
        entity_label=asset.name,
        metadata={
            "asset_type": asset.asset_type,
            "environment": asset.environment,
            "criticality": asset.criticality,
            "status": asset.status,
        },
    )
    db.commit()
    return AssetRead.model_validate(asset)


@router.patch(
    "/{asset_id}",
    response_model=AssetRead,
    summary="Update an asset (partial, content only)",
    responses={404: {"model": MessageResponse}, 422: {"description": "Validation error"}},
    dependencies=[Depends(require_trusted_origin)],
)
def update_asset_endpoint(
    asset_id: uuid.UUID,
    payload: AssetUpdate,
    db: Session = Depends(get_db),
    ctx: AuditContext = Depends(get_audit_context),
) -> AssetRead:
    asset = _load(db, asset_id)
    before = _asset_audit_snapshot(asset)
    asset = update_asset(db, asset, payload)
    changes = diff_fields(
        before,
        _asset_audit_snapshot(asset),
        payload.model_dump(exclude_unset=True).keys(),
    )
    if changes:
        record_event(
            db,
            ctx=ctx,
            action=AuditAction.UPDATE,
            entity_type=AuditEntityType.ASSET,
            entity_id=asset.id,
            entity_label=asset.name,
            changes=changes,
        )
    db.commit()
    return AssetRead.model_validate(asset)


@router.post(
    "/{asset_id}/deactivate",
    response_model=AssetRead,
    summary="Deactivate an asset (soft, idempotent)",
    responses={404: {"model": MessageResponse}},
    dependencies=[Depends(require_trusted_origin)],
)
def deactivate_asset_endpoint(
    asset_id: uuid.UUID,
    db: Session = Depends(get_db),
    ctx: AuditContext = Depends(get_audit_context),
) -> AssetRead:
    return _set_active_audited(db, ctx, _load(db, asset_id), is_active=False)


@router.post(
    "/{asset_id}/reactivate",
    response_model=AssetRead,
    summary="Reactivate an asset (idempotent)",
    responses={404: {"model": MessageResponse}},
    dependencies=[Depends(require_trusted_origin)],
)
def reactivate_asset_endpoint(
    asset_id: uuid.UUID,
    db: Session = Depends(get_db),
    ctx: AuditContext = Depends(get_audit_context),
) -> AssetRead:
    return _set_active_audited(db, ctx, _load(db, asset_id), is_active=True)


def _set_active_audited(
    db: Session, ctx: AuditContext, asset: Asset, *, is_active: bool
) -> AssetRead:
    was_active = asset.is_active
    asset = set_active(db, asset, is_active=is_active)
    if asset.is_active != was_active:  # skip the idempotent no-op
        record_event(
            db,
            ctx=ctx,
            action=AuditAction.STATUS_CHANGED,
            entity_type=AuditEntityType.ASSET,
            entity_id=asset.id,
            entity_label=asset.name,
            changes=[FieldChange("is_active", was_active, asset.is_active)],
        )
    db.commit()
    return AssetRead.model_validate(asset)
