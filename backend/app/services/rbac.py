"""RBAC catalog, seeding, permission resolution and safe administrative mutations.

This module is the **single source of truth** for:

* the permission catalog (:data:`PERMISSION_CATALOG`) - every capability the
  backend enforces;
* the built-in system roles (:data:`SYSTEM_ROLES`) and their permission sets;
* how a user's **effective permissions** are resolved (the union across roles);
* the **last-active-administrator** invariant and the concurrency-safe checks
  that protect it.

Nothing here commits - callers (routes / migration / test fixtures) own the
transaction, exactly like :mod:`app.services.audit`.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from typing import NamedTuple

from sqlalchemy import ColumnElement, delete, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.rbac import Permission, Role, RolePermission, UserRole
from app.models.user import TOGGLEABLE_STATUSES, AccountStatus, User

_ACTIVE = AccountStatus.ACTIVE.value

# --------------------------------------------------------------------------
# Permission catalog
# --------------------------------------------------------------------------


class PermissionDef(NamedTuple):
    code: str
    group: str
    #: Human description (English). The frontend shows a Spanish label; the
    #: ``code`` is the stable identifier and is never translated.
    description: str


#: Every capability the backend enforces. Adding a row here + a migration that
#: seeds it is all that is needed to introduce a new permission - Administrator
#: picks it up automatically (see :data:`SYSTEM_ROLES`).
PERMISSION_CATALOG: tuple[PermissionDef, ...] = (
    # Assets
    PermissionDef("assets.read", "assets", "List and view assets, filters and summary"),
    PermissionDef("assets.create", "assets", "Create assets"),
    PermissionDef("assets.update", "assets", "Edit asset fields and lifecycle state"),
    PermissionDef("assets.delete", "assets", "Move assets to Trash"),
    # Incidents
    PermissionDef("incidents.read", "incidents", "List and view incidents, timeline and summary"),
    PermissionDef("incidents.create", "incidents", "Create incidents"),
    PermissionDef("incidents.update", "incidents", "Edit incident fields and affected assets"),
    PermissionDef("incidents.resolve", "incidents", "Resolve and reopen incidents"),
    PermissionDef("incidents.delete", "incidents", "Move incidents to Trash"),
    # Audit
    PermissionDef("audit.read", "audit", "Access the audit log"),
    # Trash
    PermissionDef("trash.read", "trash", "Inspect Trash"),
    PermissionDef("trash.restore", "trash", "Restore trashed records"),
    # Users
    PermissionDef("users.read", "users", "List and view users"),
    PermissionDef("users.manage", "users", "Change user active state and role assignments"),
    # Roles
    PermissionDef("roles.read", "roles", "List and view roles and the permission catalog"),
    PermissionDef("roles.manage", "roles", "Create, edit and delete custom roles"),
    # AI Assistant (read-only intelligence; each AI tool still enforces the
    # underlying domain permission - ``ai.use`` alone grants no data access).
    PermissionDef("ai.use", "ai", "Use the AI Assistant to ask about infrastructure data"),
    # Asset relationships & topology (kept distinct from assets.* - topology is
    # its own capability and will back future AI / impact-analysis features).
    PermissionDef(
        "relationships.read",
        "relationships",
        "View asset relationships and the topology graph",
    ),
    PermissionDef(
        "relationships.manage",
        "relationships",
        "Create, edit and delete asset relationships",
    ),
)

#: Ordered groups for the frontend permission matrix.
PERMISSION_GROUPS: tuple[str, ...] = (
    "assets",
    "incidents",
    "audit",
    "trash",
    "users",
    "roles",
    "ai",
    "relationships",
)

ALL_PERMISSION_CODES: frozenset[str] = frozenset(p.code for p in PERMISSION_CATALOG)

#: Reserved for the RBAC-gated "empty Trash" feature (not implemented / not
#: seeded this milestone). Documented in docs/architecture.md.
RESERVED_PERMISSION_CODES: frozenset[str] = frozenset({"trash.purge"})

# --------------------------------------------------------------------------
# System roles
# --------------------------------------------------------------------------

ADMIN_ROLE_SLUG = "administrator"
#: The role pre-selected in the "approve access request" dialog. Public
#: registration no longer auto-assigns any role - an administrator picks the
#: role(s) when approving.
DEFAULT_ROLE_SLUG = "viewer"


class SystemRoleDef(NamedTuple):
    slug: str
    name: str
    description: str
    permissions: frozenset[str]


_OPERATOR_PERMS = frozenset(
    {
        "assets.read",
        "assets.create",
        "assets.update",
        "incidents.read",
        "incidents.create",
        "incidents.update",
        "incidents.resolve",
        "trash.read",
        "trash.restore",
        "ai.use",
        "relationships.read",
        "relationships.manage",
    }
)
_ANALYST_PERMS = frozenset(
    {
        "assets.read",
        "incidents.read",
        "audit.read",
        "trash.read",
        "ai.use",
        "relationships.read",
    }
)
_VIEWER_PERMS = frozenset(
    {"assets.read", "incidents.read", "ai.use", "relationships.read"}
)

#: Built-in roles. **Administrator always holds every catalog permission** - it is
#: computed from :data:`ALL_PERMISSION_CODES`, so a newly introduced permission is
#: granted to Administrator the moment its migration seeds it (see
#: docs/architecture.md "future permission additions").
SYSTEM_ROLES: tuple[SystemRoleDef, ...] = (
    SystemRoleDef(
        ADMIN_ROLE_SLUG,
        "Administrator",
        "Full access to every part of InfraGuard AI, including user and role administration.",
        ALL_PERMISSION_CODES,
    ),
    SystemRoleDef(
        "operator",
        "Operator",
        "Day-to-day operations: manage assets and incidents and restore from Trash. "
        "No user or role administration.",
        _OPERATOR_PERMS,
    ),
    SystemRoleDef(
        "analyst",
        "Analyst",
        "Read-only investigator: assets, incidents, the audit log and Trash.",
        _ANALYST_PERMS,
    ),
    SystemRoleDef(
        "viewer",
        "Viewer",
        "Read-only access to assets and incidents. Pre-selected when approving a "
        "new access request.",
        _VIEWER_PERMS,
    ),
)

SYSTEM_ROLE_SLUGS: frozenset[str] = frozenset(r.slug for r in SYSTEM_ROLES)


class LastAdminError(Exception):
    """Raised when a mutation would leave zero active Administrators."""


class RoleInUseError(Exception):
    """Raised when a custom role that is still assigned to users is deleted."""


class AccountStateError(Exception):
    """Raised when an administrative action does not apply to the account's
    current :class:`~app.models.user.AccountStatus` (e.g. toggling ``is_active``
    on a ``pending`` account, or approving an already-``active`` one)."""


# --------------------------------------------------------------------------
# Seeding (idempotent) - run by the migration, the test fixture and can be
# re-run safely at any time.
# --------------------------------------------------------------------------


def sync_permission_catalog(db: Session) -> None:
    """Insert any missing catalog permissions and refresh descriptions.

    Additive only: a code that exists in the DB but not in the catalog is left
    alone (so a rolled-back future migration never orphans role_permissions).
    """
    existing = {
        row.code: row
        for row in db.execute(select(Permission)).scalars().all()
    }
    for perm in PERMISSION_CATALOG:
        current = existing.get(perm.code)
        if current is None:
            db.add(Permission(code=perm.code, description=perm.description))
        elif current.description != perm.description:
            current.description = perm.description
    db.flush()


def ensure_system_roles(db: Session) -> None:
    """Create/refresh the built-in roles and reconcile their permission sets.

    System-role identity (name, description) and permissions are **owned by
    code** - they are re-synced here on every run and are read-only through the
    API. Custom roles are never touched.
    """
    sync_permission_catalog(db)
    perm_ids = {
        row.code: row.id for row in db.execute(select(Permission)).scalars().all()
    }
    for spec in SYSTEM_ROLES:
        role = db.execute(
            select(Role).where(Role.slug == spec.slug)
        ).scalar_one_or_none()
        if role is None:
            role = Role(slug=spec.slug, name=spec.name, is_system=True)
            db.add(role)
        role.name = spec.name
        role.description = spec.description
        role.is_system = True
        db.flush()

        want = {perm_ids[c] for c in spec.permissions if c in perm_ids}
        have = {
            row.permission_id
            for row in db.execute(
                select(RolePermission).where(RolePermission.role_id == role.id)
            )
            .scalars()
            .all()
        }
        for pid in want - have:
            db.add(RolePermission(role_id=role.id, permission_id=pid))
        if have - want:
            db.execute(
                delete(RolePermission).where(
                    RolePermission.role_id == role.id,
                    RolePermission.permission_id.in_(have - want),
                )
            )
    db.flush()


def seed_rbac(db: Session) -> None:
    """Full idempotent seed: permission catalog + system roles."""
    ensure_system_roles(db)


# --------------------------------------------------------------------------
# Resolution
# --------------------------------------------------------------------------


def resolve_effective_permissions(db: Session, user_id: uuid.UUID) -> frozenset[str]:
    """The union of every permission granted by every role assigned to the user.

    One query, no N+1. Returns an empty set for a user with no roles.
    """
    rows = db.execute(
        select(Permission.code)
        .select_from(Permission)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(UserRole, UserRole.role_id == RolePermission.role_id)
        .where(UserRole.user_id == user_id)
        .distinct()
    ).scalars().all()
    return frozenset(rows)


def get_roles_for_user(db: Session, user_id: uuid.UUID) -> list[Role]:
    """Roles assigned to the user, ordered by name. System roles first."""
    return list(
        db.execute(
            select(Role)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(UserRole.user_id == user_id)
            .order_by(Role.is_system.desc(), Role.name.asc())
        )
        .scalars()
        .all()
    )


def role_by_slug(db: Session, slug: str) -> Role | None:
    return db.execute(select(Role).where(Role.slug == slug)).scalar_one_or_none()


def role_permission_codes(db: Session, role_id: uuid.UUID) -> list[str]:
    return list(
        db.execute(
            select(Permission.code)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .where(RolePermission.role_id == role_id)
            .order_by(Permission.code.asc())
        )
        .scalars()
        .all()
    )


# --------------------------------------------------------------------------
# Administrator-lockout invariant
# --------------------------------------------------------------------------


def _active_admin_ids(db: Session, *, lock: bool) -> set[uuid.UUID]:
    """Ids of active users holding the Administrator role.

    With ``lock=True`` the underlying ``users`` rows are ``SELECT ... FOR UPDATE``
    locked so a concurrent dangerous mutation blocks until this transaction
    commits - the last-admin check and the mutation are then effectively atomic.
    """
    stmt = (
        select(User.id)
        .join(UserRole, UserRole.user_id == User.id)
        .join(Role, Role.id == UserRole.role_id)
        .where(Role.slug == ADMIN_ROLE_SLUG, User.account_status == _ACTIVE)
    )
    if lock:
        stmt = stmt.with_for_update(of=User)
    return set(db.execute(stmt).scalars().all())


def count_active_admins(db: Session) -> int:
    return db.execute(
        select(func.count(func.distinct(User.id)))
        .select_from(User)
        .join(UserRole, UserRole.user_id == User.id)
        .join(Role, Role.id == UserRole.role_id)
        .where(Role.slug == ADMIN_ROLE_SLUG, User.account_status == _ACTIVE)
    ).scalar_one()


def user_has_admin_role(db: Session, user_id: uuid.UUID) -> bool:
    return db.execute(
        select(UserRole.user_id)
        .join(Role, Role.id == UserRole.role_id)
        .where(UserRole.user_id == user_id, Role.slug == ADMIN_ROLE_SLUG)
        .limit(1)
    ).first() is not None


def _assert_admins_remain(
    db: Session, *, losing_admin: uuid.UUID
) -> None:
    """Raise :class:`LastAdminError` if removing ``losing_admin``'s active-admin
    status would leave the system with no active Administrator."""
    remaining = _active_admin_ids(db, lock=True) - {losing_admin}
    if not remaining:
        raise LastAdminError(
            "This action would leave InfraGuard AI with no active administrator."
        )


# --------------------------------------------------------------------------
# Mutations (no commit)
# --------------------------------------------------------------------------


def _grant_role(
    db: Session, *, user_id: uuid.UUID, role_id: uuid.UUID, assigned_by: uuid.UUID | None
) -> None:
    exists = db.execute(
        select(UserRole).where(
            UserRole.user_id == user_id, UserRole.role_id == role_id
        )
    ).scalar_one_or_none()
    if exists is None:
        db.add(UserRole(user_id=user_id, role_id=role_id, assigned_by=assigned_by))
        db.flush()


def grant_roles(
    db: Session, *, user_id: uuid.UUID, role_ids: Iterable[uuid.UUID], assigned_by: uuid.UUID
) -> None:
    """Idempotently add roles to a user (no removals)."""
    for rid in set(role_ids):
        _grant_role(db, user_id=user_id, role_id=rid, assigned_by=assigned_by)


def set_user_active(
    db: Session, *, target: User, is_active: bool, actor: User
) -> bool:
    """Runtime enable / disable of an **already-provisioned** account
    (``active`` <-> ``disabled``). Returns ``True`` if the state changed.

    Guards:
    * only applies to ``active`` / ``disabled`` accounts - a ``pending`` /
      ``rejected`` account must go through approve / reject
      (:class:`AccountStateError`);
    * disabling the **last** active Administrator is blocked, the actor
      themselves included (:class:`LastAdminError`).
    """
    current = AccountStatus(target.account_status)
    if current not in TOGGLEABLE_STATUSES:
        raise AccountStateError(
            f"account is {current.value}; use the approve / reject actions"
        )
    want = AccountStatus.ACTIVE if is_active else AccountStatus.DISABLED
    if current == want:
        return False
    if not is_active and user_has_admin_role(db, target.id):
        _assert_admins_remain(db, losing_admin=target.id)
    target.account_status = want.value
    db.flush()
    return True


def approve_user(
    db: Session, *, target: User, role_ids: Iterable[uuid.UUID], actor: User
) -> list[Role]:
    """Approve a ``pending`` (or previously ``rejected``) access request.

    Requires **at least one** valid role - approving with no roles would create
    an account that can authenticate but do nothing. Sets ``account_status`` to
    ``active`` and grants the roles. Returns the granted :class:`Role` objects.
    """
    current = AccountStatus(target.account_status)
    if current not in (AccountStatus.PENDING, AccountStatus.REJECTED):
        raise AccountStateError(f"account is already {current.value}")

    want_ids = {rid for rid in role_ids}
    if not want_ids:
        raise ValueError("approving a request requires at least one role")
    known = {
        r.id: r
        for r in db.execute(select(Role).where(Role.id.in_(want_ids))).scalars().all()
    }
    missing = want_ids - set(known)
    if missing:
        raise ValueError(f"unknown role id(s): {sorted(str(m) for m in missing)}")

    target.account_status = AccountStatus.ACTIVE.value
    grant_roles(db, user_id=target.id, role_ids=want_ids, assigned_by=actor.id)
    db.flush()
    return [known[r] for r in sorted(want_ids, key=str)]


def reject_user(db: Session, *, target: User, actor: User) -> None:
    """Decline a ``pending`` access request. The row is kept (history + it blocks
    re-registration of the email)."""
    current = AccountStatus(target.account_status)
    if current != AccountStatus.PENDING:
        raise AccountStateError(f"only a pending request can be rejected (is {current.value})")
    target.account_status = AccountStatus.REJECTED.value
    db.flush()


def set_user_roles(
    db: Session, *, target: User, role_ids: Iterable[uuid.UUID], actor: User
) -> tuple[list[Role], list[Role]]:
    """Replace the user's role set. Returns ``(added_roles, removed_roles)``.

    Guards: removing the Administrator role from the **last** active Administrator
    is blocked (:class:`LastAdminError`), the actor included.
    """
    want_ids = set(role_ids)
    known = {
        r.id: r
        for r in db.execute(select(Role).where(Role.id.in_(want_ids))).scalars().all()
    }
    missing = want_ids - set(known)
    if missing:
        raise ValueError(f"unknown role id(s): {sorted(str(m) for m in missing)}")

    current = {
        link.role_id: link
        for link in db.execute(
            select(UserRole).where(UserRole.user_id == target.id)
        ).scalars().all()
    }
    current_role_map = {
        r.id: r
        for r in db.execute(
            select(Role).where(Role.id.in_(current.keys()))
        ).scalars().all()
    } if current else {}

    to_add = want_ids - set(current)
    to_remove = set(current) - want_ids

    admin = role_by_slug(db, ADMIN_ROLE_SLUG)
    if (
        admin is not None
        and admin.id in to_remove
        and target.is_active
    ):
        _assert_admins_remain(db, losing_admin=target.id)

    for rid in to_remove:
        db.execute(
            delete(UserRole).where(
                UserRole.user_id == target.id, UserRole.role_id == rid
            )
        )
    for rid in to_add:
        db.add(UserRole(user_id=target.id, role_id=rid, assigned_by=actor.id))
    db.flush()

    added = [known[r] for r in sorted(to_add, key=str)]
    removed = [
        current_role_map[r]
        for r in sorted(to_remove, key=str)
        if r in current_role_map
    ]
    return added, removed


def create_custom_role(
    db: Session, *, name: str, description: str | None, permission_codes: Iterable[str]
) -> Role:
    codes = _validated_codes(permission_codes)
    role = Role(
        name=name.strip(),
        slug=_slugify_unique(db, name),
        description=(description or None),
        is_system=False,
    )
    db.add(role)
    db.flush()
    _set_role_permissions(db, role, codes)
    db.flush()
    return role


def update_custom_role(
    db: Session,
    *,
    role: Role,
    name: str | None = None,
    description: str | None = None,
    description_set: bool = False,
) -> None:
    if role.is_system:
        raise ValueError("system roles cannot be edited")
    if name is not None and name.strip() and name.strip() != role.name:
        role.name = name.strip()
    if description_set:
        role.description = (description or None)
    db.flush()


def set_role_permissions(
    db: Session, *, role: Role, permission_codes: Iterable[str]
) -> tuple[list[str], list[str]]:
    """Replace a custom role's permissions. Returns ``(before_codes, after_codes)``."""
    if role.is_system:
        raise ValueError("system role permissions are managed by InfraGuard AI")
    before = role_permission_codes(db, role.id)
    after = sorted(_validated_codes(permission_codes))
    _set_role_permissions(db, role, after)
    db.flush()
    return before, after


def delete_custom_role(db: Session, *, role: Role) -> None:
    if role.is_system:
        raise ValueError("system roles cannot be deleted")
    assigned = db.execute(
        select(func.count()).select_from(UserRole).where(UserRole.role_id == role.id)
    ).scalar_one()
    if assigned:
        raise RoleInUseError(
            f"role is still assigned to {assigned} user(s); reassign them first"
        )
    db.delete(role)
    db.flush()


# --------------------------------------------------------------------------
# Internals
# --------------------------------------------------------------------------


def _validated_codes(codes: Iterable[str]) -> set[str]:
    deduped = {c.strip() for c in codes if c and c.strip()}
    unknown = deduped - ALL_PERMISSION_CODES
    if unknown:
        raise ValueError(f"unknown permission code(s): {sorted(unknown)}")
    return deduped


def _set_role_permissions(db: Session, role: Role, codes: Iterable[str]) -> None:
    want = set(codes)
    perm_ids = {
        row.code: row.id
        for row in db.execute(
            select(Permission).where(Permission.code.in_(want))
        ).scalars().all()
    }
    db.execute(delete(RolePermission).where(RolePermission.role_id == role.id))
    for code in want:
        db.add(RolePermission(role_id=role.id, permission_id=perm_ids[code]))


def _slugify_unique(db: Session, name: str) -> str:
    base = "".join(
        ch if ch.isalnum() else "-" for ch in name.strip().lower()
    ).strip("-")
    base = "-".join(filter(None, base.split("-"))) or "role"
    base = base[:ROLE_SLUG_CAP]
    slug = base
    n = 2
    while db.execute(select(Role.id).where(Role.slug == slug)).first() is not None:
        suffix = f"-{n}"
        slug = base[: ROLE_SLUG_CAP - len(suffix)] + suffix
        n += 1
    return slug


ROLE_SLUG_CAP = 80


def roles_with_counts(db: Session) -> list[tuple[Role, int, int]]:
    """``(role, user_count, permission_count)`` for every role - two aggregate
    queries, no N+1."""
    user_counts = dict(
        db.execute(
            select(UserRole.role_id, func.count()).group_by(UserRole.role_id)
        ).all()
    )
    perm_counts = dict(
        db.execute(
            select(RolePermission.role_id, func.count()).group_by(RolePermission.role_id)
        ).all()
    )
    roles = (
        db.execute(select(Role).order_by(Role.is_system.desc(), Role.name.asc()))
        .scalars()
        .all()
    )
    return [
        (r, int(user_counts.get(r.id, 0)), int(perm_counts.get(r.id, 0))) for r in roles
    ]


def role_detail(db: Session, role_id: uuid.UUID) -> Role | None:
    return db.execute(
        select(Role)
        .where(Role.id == role_id)
        .options(selectinload(Role.permissions).selectinload(RolePermission.permission))
    ).scalar_one_or_none()


def users_for_role(db: Session, role_id: uuid.UUID) -> list[User]:
    return list(
        db.execute(
            select(User)
            .join(UserRole, UserRole.user_id == User.id)
            .where(UserRole.role_id == role_id)
            .order_by(User.email.asc())
        )
        .scalars()
        .all()
    )


# --------------------------------------------------------------------------
# User administration - list + detail (no N+1)
# --------------------------------------------------------------------------


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@dataclass(frozen=True, slots=True)
class AdminUserQuery:
    search: str | None = None
    #: One of :class:`~app.models.user.AccountStatus`'s values, or ``None`` for all.
    status: str | None = None
    role_slug: str | None = None
    page: int = 1
    page_size: int = 20


def _admin_user_conditions(q: AdminUserQuery) -> list[ColumnElement[bool]]:
    conds: list[ColumnElement[bool]] = []
    term = (q.search or "").strip()
    if term:
        pattern = f"%{_escape_like(term)}%"
        conds.append(or_(User.email.ilike(pattern, escape="\\")))
    if q.status:
        conds.append(User.account_status == q.status)
    return conds


def list_users(
    db: Session, q: AdminUserQuery
) -> tuple[list[tuple[User, list[Role]]], int]:
    """``([(user, [roles]), ...], total)`` - two queries total, no per-user
    role fetch. Optional ``role_slug`` restricts to users holding that role."""
    conds = _admin_user_conditions(q)

    base = select(User.id).where(*conds)
    if q.role_slug:
        base = (
            base.join(UserRole, UserRole.user_id == User.id)
            .join(Role, Role.id == UserRole.role_id)
            .where(Role.slug == q.role_slug)
        )

    total = db.execute(
        select(func.count()).select_from(base.subquery())
    ).scalar_one()

    # Access requests read best newest-first; the general list stays alphabetical.
    order = (
        (User.created_at.desc(), User.id.desc())
        if q.status == "pending"
        else (User.email.asc(),)
    )
    id_rows = db.execute(
        base.order_by(*order)
        .offset((q.page - 1) * q.page_size)
        .limit(q.page_size)
    ).scalars().all()

    if not id_rows:
        return [], int(total)

    users = {
        u.id: u
        for u in db.execute(select(User).where(User.id.in_(id_rows))).scalars().all()
    }
    role_rows = db.execute(
        select(UserRole.user_id, Role)
        .join(Role, Role.id == UserRole.role_id)
        .where(UserRole.user_id.in_(id_rows))
        .order_by(Role.is_system.desc(), Role.name.asc())
    ).all()
    roles_by_user: dict[uuid.UUID, list[Role]] = {}
    for uid, role in role_rows:
        roles_by_user.setdefault(uid, []).append(role)

    return (
        [(users[uid], roles_by_user.get(uid, [])) for uid in id_rows],
        int(total),
    )


def is_last_active_admin(db: Session, user_id: uuid.UUID) -> bool:
    admins = _active_admin_ids(db, lock=False)
    return admins == {user_id}
