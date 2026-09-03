"""User & Role administration (Governance & Administration - Phase 3, RBAC).

Users / access requests
  * ``GET  /admin/users``                - list (search / ``status`` / role / page)
  * ``GET  /admin/access-requests``      - pending requests, newest first
  * ``GET  /admin/users/{id}``           - identity + status + roles + effective perms
  * ``PATCH /admin/users/{id}``          - enable / disable an **active** account
  * ``POST /admin/users/{id}/approve``   - approve a request (assign roles, activate)
  * ``POST /admin/users/{id}/reject``    - reject a pending request
  * ``GET|PUT /admin/users/{id}/roles``  - read / replace the role set
Roles
  * ``GET|POST /admin/roles`` · ``GET|PATCH|DELETE /admin/roles/{id}``
  * ``PUT /admin/roles/{id}/permissions`` · ``GET /admin/permissions``

Authorization: reads require ``users.read`` / ``roles.read``; mutations require
``users.manage`` / ``roles.manage``. **System roles are immutable** through the
API and cannot be deleted. The **last active Administrator** can never be
disabled or stripped of the Administrator role - the check runs under a row lock
so it is safe under concurrent requests (``409``).

Account lifecycle: public registration creates a ``pending`` account with **no
roles**. It becomes usable only via ``approve`` (roles required) or the explicit
bootstrap command. ``PATCH ... {is_active}`` only toggles ``active`` <->
``disabled``; a ``pending`` / ``rejected`` account returns ``409``.

Every administrative mutation is written to the existing audit log (entity types
``User`` / ``Role``) in the same transaction as the change.
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
from app.models.rbac import Role
from app.models.user import AccountStatus, User
from app.schemas.auth import MessageResponse
from app.schemas.rbac import (
    MAX_PAGE_SIZE,
    USERS_DEFAULT_PAGE_SIZE,
    AdminUserDetail,
    AdminUserListItem,
    AdminUserPage,
    AdminUserUpdate,
    ApproveAccessRequest,
    PermissionCatalog,
    PermissionRead,
    RoleCreate,
    RoleDetail,
    RoleListItem,
    RolePage,
    RolePermissionsUpdate,
    RoleRef,
    RoleUpdate,
    RoleUserRef,
    UserRolesUpdate,
)
from app.services.audit import AuditContext, FieldChange, record_event
from app.services.rbac import (
    PERMISSION_CATALOG,
    PERMISSION_GROUPS,
    AccountStateError,
    AdminUserQuery,
    LastAdminError,
    RoleInUseError,
    approve_user,
    create_custom_role,
    delete_custom_role,
    get_roles_for_user,
    is_last_active_admin,
    list_users,
    reject_user,
    resolve_effective_permissions,
    role_detail,
    role_permission_codes,
    roles_with_counts,
    set_role_permissions,
    set_user_active,
    set_user_roles,
    update_custom_role,
    users_for_role,
)
from app.services.users import get_by_id

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(get_current_user)],
)

_CAN_READ_USERS = Depends(require_permission("users.read"))
_CAN_MANAGE_USERS = Depends(require_permission("users.manage"))
_CAN_READ_ROLES = Depends(require_permission("roles.read"))
_CAN_MANAGE_ROLES = Depends(require_permission("roles.manage"))

_USER_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
_ROLE_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")


def _conflict(exc: Exception) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


def _bad_request(exc: Exception) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


def _role_ref(role: Role) -> RoleRef:
    return RoleRef.model_validate(role)


# ==========================================================================
# Permission catalog
# ==========================================================================


@router.get(
    "/permissions",
    response_model=PermissionCatalog,
    summary="The permission catalog (grouped for the matrix editor)",
    dependencies=[_CAN_READ_ROLES],
)
def list_permissions_endpoint() -> PermissionCatalog:
    return PermissionCatalog(
        groups=list(PERMISSION_GROUPS),
        permissions=[
            PermissionRead(code=p.code, group=p.group, description=p.description)
            for p in PERMISSION_CATALOG
        ],
    )


# ==========================================================================
# Users
# ==========================================================================


def _user_list_item(user: User, roles: list[Role]) -> AdminUserListItem:
    return AdminUserListItem(
        id=user.id,
        email=user.email,
        account_status=user.account_status,
        is_active=user.is_active,
        created_at=user.created_at,
        roles=[_role_ref(r) for r in roles],
    )


def _users_page(
    db: Session, query: AdminUserQuery, *, page: int, page_size: int
) -> AdminUserPage:
    rows, total = list_users(db, query)
    total_pages = (total + page_size - 1) // page_size if total else 0
    return AdminUserPage(
        items=[_user_list_item(user, roles) for user, roles in rows],
        page=page,
        page_size=page_size,
        total=total,
        total_pages=total_pages,
    )


@router.get(
    "/users",
    response_model=AdminUserPage,
    summary="List users (search / account status / role / pagination)",
    dependencies=[_CAN_READ_USERS],
)
def list_users_endpoint(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(USERS_DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    q: str | None = Query(None, max_length=320, description="Match email (contains)"),
    account_status: AccountStatus | None = Query(None, alias="status"),
    role: str | None = Query(None, max_length=80, description="Role slug"),
) -> AdminUserPage:
    query = AdminUserQuery(
        search=q,
        status=account_status.value if account_status else None,
        role_slug=role,
        page=page,
        page_size=page_size,
    )
    return _users_page(db, query, page=page, page_size=page_size)


@router.get(
    "/access-requests",
    response_model=AdminUserPage,
    summary="Pending access requests (newest first)",
    dependencies=[_CAN_READ_USERS],
)
def list_access_requests_endpoint(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(USERS_DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    q: str | None = Query(None, max_length=320),
) -> AdminUserPage:
    query = AdminUserQuery(
        search=q,
        status=AccountStatus.PENDING.value,
        page=page,
        page_size=page_size,
    )
    return _users_page(db, query, page=page, page_size=page_size)


def _load_user(db: Session, user_id: uuid.UUID) -> User:
    user = get_by_id(db, user_id)
    if user is None:
        raise _USER_NOT_FOUND
    return user


def _user_detail(db: Session, user: User) -> AdminUserDetail:
    roles = get_roles_for_user(db, user.id)
    perms = resolve_effective_permissions(db, user.id)
    return AdminUserDetail(
        id=user.id,
        email=user.email,
        account_status=user.account_status,
        is_active=user.is_active,
        created_at=user.created_at,
        updated_at=user.updated_at,
        roles=[_role_ref(r) for r in roles],
        permissions=sorted(perms),
        is_last_active_admin=is_last_active_admin(db, user.id),
    )


@router.get(
    "/users/{user_id}",
    response_model=AdminUserDetail,
    summary="User detail: identity + roles + effective permissions",
    responses={404: {"model": MessageResponse}},
    dependencies=[_CAN_READ_USERS],
)
def get_user_endpoint(user_id: uuid.UUID, db: Session = Depends(get_db)) -> AdminUserDetail:
    return _user_detail(db, _load_user(db, user_id))


@router.get(
    "/users/{user_id}/roles",
    response_model=list[RoleRef],
    summary="A user's assigned roles",
    responses={404: {"model": MessageResponse}},
    dependencies=[_CAN_READ_USERS],
)
def get_user_roles_endpoint(
    user_id: uuid.UUID, db: Session = Depends(get_db)
) -> list[RoleRef]:
    _load_user(db, user_id)
    return [_role_ref(r) for r in get_roles_for_user(db, user_id)]


def _audit_status_change(
    db: Session, ctx: AuditContext, user: User, *, before: str, after: str, via: str
) -> None:
    record_event(
        db,
        ctx=ctx,
        action=AuditAction.STATUS_CHANGED,
        entity_type=AuditEntityType.USER,
        entity_id=user.id,
        entity_label=user.email,
        changes=[FieldChange("account_status", before, after)],
        metadata={"via": via},
    )


@router.patch(
    "/users/{user_id}",
    response_model=AdminUserDetail,
    summary="Enable / disable an active account",
    responses={
        404: {"model": MessageResponse},
        409: {
            "model": MessageResponse,
            "description": "Last administrator, or account is pending / rejected",
        },
    },
    dependencies=[Depends(require_trusted_origin), _CAN_MANAGE_USERS],
)
def update_user_endpoint(
    user_id: uuid.UUID,
    payload: AdminUserUpdate,
    db: Session = Depends(get_db),
    ctx: AuditContext = Depends(get_audit_context),
) -> AdminUserDetail:
    user = _load_user(db, user_id)
    before = user.account_status
    try:
        changed = set_user_active(db, target=user, is_active=payload.is_active, actor=user)
    except LastAdminError as exc:
        raise _conflict(exc) from exc
    except AccountStateError as exc:
        raise _conflict(exc) from exc

    if changed:
        _audit_status_change(
            db, ctx, user, before=before, after=user.account_status, via="toggle"
        )
    db.commit()
    return _user_detail(db, user)


@router.post(
    "/users/{user_id}/approve",
    response_model=AdminUserDetail,
    summary="Approve a pending access request (assigns roles, activates)",
    responses={
        404: {"model": MessageResponse},
        409: {"model": MessageResponse, "description": "Account is not pending / rejected"},
        422: {"description": "No roles, or unknown role id"},
    },
    dependencies=[Depends(require_trusted_origin), _CAN_MANAGE_USERS],
)
def approve_user_endpoint(
    user_id: uuid.UUID,
    payload: ApproveAccessRequest,
    db: Session = Depends(get_db),
    ctx: AuditContext = Depends(get_audit_context),
) -> AdminUserDetail:
    user = _load_user(db, user_id)
    before = user.account_status
    try:
        granted = approve_user(
            db, target=user, role_ids=set(payload.role_ids), actor=user
        )
    except AccountStateError as exc:
        raise _conflict(exc) from exc
    except ValueError as exc:
        raise _bad_request(exc) from exc

    _audit_status_change(
        db, ctx, user, before=before, after=user.account_status, via="approve"
    )
    record_event(
        db,
        ctx=ctx,
        action=AuditAction.UPDATE,
        entity_type=AuditEntityType.USER,
        entity_id=user.id,
        entity_label=user.email,
        changes=[FieldChange("roles", [], sorted(r.slug for r in granted))],
        metadata={"roles": {"added": sorted(r.slug for r in granted), "removed": []}},
    )
    db.commit()
    return _user_detail(db, user)


@router.post(
    "/users/{user_id}/reject",
    response_model=AdminUserDetail,
    summary="Reject a pending access request",
    responses={
        404: {"model": MessageResponse},
        409: {"model": MessageResponse, "description": "Account is not pending"},
    },
    dependencies=[Depends(require_trusted_origin), _CAN_MANAGE_USERS],
)
def reject_user_endpoint(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    ctx: AuditContext = Depends(get_audit_context),
) -> AdminUserDetail:
    user = _load_user(db, user_id)
    before = user.account_status
    try:
        reject_user(db, target=user, actor=user)
    except AccountStateError as exc:
        raise _conflict(exc) from exc

    _audit_status_change(
        db, ctx, user, before=before, after=user.account_status, via="reject"
    )
    db.commit()
    return _user_detail(db, user)


@router.put(
    "/users/{user_id}/roles",
    response_model=AdminUserDetail,
    summary="Replace a user's role set",
    responses={
        404: {"model": MessageResponse},
        409: {"model": MessageResponse, "description": "Would remove the last administrator"},
        422: {"description": "Unknown role id"},
    },
    dependencies=[Depends(require_trusted_origin), _CAN_MANAGE_USERS],
)
def set_user_roles_endpoint(
    user_id: uuid.UUID,
    payload: UserRolesUpdate,
    db: Session = Depends(get_db),
    ctx: AuditContext = Depends(get_audit_context),
) -> AdminUserDetail:
    user = _load_user(db, user_id)
    before = sorted(r.slug for r in get_roles_for_user(db, user.id))
    try:
        added, removed = set_user_roles(
            db, target=user, role_ids=set(payload.role_ids), actor=user
        )
    except LastAdminError as exc:
        raise _conflict(exc) from exc
    except ValueError as exc:
        raise _bad_request(exc) from exc

    if added or removed:
        after = sorted(r.slug for r in get_roles_for_user(db, user.id))
        record_event(
            db,
            ctx=ctx,
            action=AuditAction.UPDATE,
            entity_type=AuditEntityType.USER,
            entity_id=user.id,
            entity_label=user.email,
            changes=[FieldChange("roles", before, after)],
            metadata={
                "roles": {
                    "added": sorted(r.slug for r in added),
                    "removed": sorted(r.slug for r in removed),
                }
            },
        )
    db.commit()
    return _user_detail(db, user)


# ==========================================================================
# Roles
# ==========================================================================


@router.get(
    "/roles",
    response_model=RolePage,
    summary="Every role with user + permission counts",
    dependencies=[_CAN_READ_ROLES],
)
def list_roles_endpoint(db: Session = Depends(get_db)) -> RolePage:
    rows = roles_with_counts(db)
    return RolePage(
        items=[
            RoleListItem(
                id=role.id,
                name=role.name,
                slug=role.slug,
                description=role.description,
                is_system=role.is_system,
                user_count=users,
                permission_count=perms,
            )
            for role, users, perms in rows
        ],
        total=len(rows),
    )


def _load_role(db: Session, role_id: uuid.UUID) -> Role:
    role = role_detail(db, role_id)
    if role is None:
        raise _ROLE_NOT_FOUND
    return role


def _role_detail_payload(db: Session, role: Role) -> RoleDetail:
    return RoleDetail(
        id=role.id,
        name=role.name,
        slug=role.slug,
        description=role.description,
        is_system=role.is_system,
        created_at=role.created_at,
        updated_at=role.updated_at,
        permissions=role_permission_codes(db, role.id),
        users=[RoleUserRef.model_validate(u) for u in users_for_role(db, role.id)],
    )


@router.get(
    "/roles/{role_id}",
    response_model=RoleDetail,
    summary="Role detail: permissions + assigned users",
    responses={404: {"model": MessageResponse}},
    dependencies=[_CAN_READ_ROLES],
)
def get_role_endpoint(role_id: uuid.UUID, db: Session = Depends(get_db)) -> RoleDetail:
    return _role_detail_payload(db, _load_role(db, role_id))


@router.post(
    "/roles",
    response_model=RoleDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Create a custom role",
    responses={422: {"description": "Validation error"}},
    dependencies=[Depends(require_trusted_origin), _CAN_MANAGE_ROLES],
)
def create_role_endpoint(
    payload: RoleCreate,
    db: Session = Depends(get_db),
    ctx: AuditContext = Depends(get_audit_context),
) -> RoleDetail:
    try:
        role = create_custom_role(
            db,
            name=payload.name,
            description=payload.description,
            permission_codes=payload.permissions,
        )
    except ValueError as exc:
        raise _bad_request(exc) from exc

    record_event(
        db,
        ctx=ctx,
        action=AuditAction.CREATE,
        entity_type=AuditEntityType.ROLE,
        entity_id=role.id,
        entity_label=role.name,
        metadata={"permissions": sorted(payload.permissions), "is_system": False},
    )
    db.commit()
    return _role_detail_payload(db, _load_role(db, role.id))


@router.patch(
    "/roles/{role_id}",
    response_model=RoleDetail,
    summary="Rename / re-describe a custom role",
    responses={
        404: {"model": MessageResponse},
        409: {"model": MessageResponse, "description": "System role is immutable"},
    },
    dependencies=[Depends(require_trusted_origin), _CAN_MANAGE_ROLES],
)
def update_role_endpoint(
    role_id: uuid.UUID,
    payload: RoleUpdate,
    db: Session = Depends(get_db),
    ctx: AuditContext = Depends(get_audit_context),
) -> RoleDetail:
    role = _load_role(db, role_id)
    if role.is_system:
        raise _conflict(ValueError("System roles cannot be edited."))

    fields = payload.model_dump(exclude_unset=True)
    before = {"name": role.name, "description": role.description}
    try:
        update_custom_role(
            db,
            role=role,
            name=payload.name,
            description=payload.description,
            description_set="description" in fields,
        )
    except ValueError as exc:
        raise _conflict(exc) from exc

    after = {"name": role.name, "description": role.description}
    changes = [
        FieldChange(k, before[k], after[k]) for k in before if before[k] != after[k]
    ]
    if changes:
        record_event(
            db,
            ctx=ctx,
            action=AuditAction.UPDATE,
            entity_type=AuditEntityType.ROLE,
            entity_id=role.id,
            entity_label=role.name,
            changes=changes,
        )
    db.commit()
    return _role_detail_payload(db, _load_role(db, role.id))


@router.put(
    "/roles/{role_id}/permissions",
    response_model=RoleDetail,
    summary="Replace a custom role's permissions",
    responses={
        404: {"model": MessageResponse},
        409: {"model": MessageResponse, "description": "System role is immutable"},
        422: {"description": "Unknown permission code"},
    },
    dependencies=[Depends(require_trusted_origin), _CAN_MANAGE_ROLES],
)
def set_role_permissions_endpoint(
    role_id: uuid.UUID,
    payload: RolePermissionsUpdate,
    db: Session = Depends(get_db),
    ctx: AuditContext = Depends(get_audit_context),
) -> RoleDetail:
    role = _load_role(db, role_id)
    if role.is_system:
        raise _conflict(ValueError("System role permissions are managed by InfraGuard AI."))
    try:
        before, after = set_role_permissions(
            db, role=role, permission_codes=payload.permissions
        )
    except ValueError as exc:
        raise _bad_request(exc) from exc

    if set(before) != set(after):
        record_event(
            db,
            ctx=ctx,
            action=AuditAction.PERMISSION_CHANGED,
            entity_type=AuditEntityType.ROLE,
            entity_id=role.id,
            entity_label=role.name,
            changes=[FieldChange("permissions", before, after)],
            metadata={
                "permissions": {
                    "added": sorted(set(after) - set(before)),
                    "removed": sorted(set(before) - set(after)),
                }
            },
        )
    db.commit()
    return _role_detail_payload(db, _load_role(db, role.id))


@router.delete(
    "/roles/{role_id}",
    response_model=MessageResponse,
    summary="Delete an unused custom role",
    responses={
        404: {"model": MessageResponse},
        409: {"model": MessageResponse, "description": "System role or role still assigned"},
    },
    dependencies=[Depends(require_trusted_origin), _CAN_MANAGE_ROLES],
)
def delete_role_endpoint(
    role_id: uuid.UUID,
    db: Session = Depends(get_db),
    ctx: AuditContext = Depends(get_audit_context),
) -> MessageResponse:
    role = _load_role(db, role_id)
    label, codes = role.name, role_permission_codes(db, role.id)
    try:
        delete_custom_role(db, role=role)
    except RoleInUseError as exc:
        raise _conflict(exc) from exc
    except ValueError as exc:
        raise _conflict(exc) from exc

    record_event(
        db,
        ctx=ctx,
        action=AuditAction.DELETE,
        entity_type=AuditEntityType.ROLE,
        entity_id=role_id,
        entity_label=label,
        metadata={"permissions": codes},
    )
    db.commit()
    return MessageResponse(detail="Role deleted")
