"""The demo-seed orchestrator.

``run_seed(db)`` is **strictly additive and idempotent**:

* every demo row has a deterministic id (:func:`app.seeds._common.seed_uuid`) -
  an existing id means "already seeded", so it is skipped;
* it never issues ``DROP`` / ``TRUNCATE`` / ``DELETE``; it never updates a row it
  did not create; it never touches users' passwords, statuses or roles, and
  never removes audit history;
* it does not commit - the caller owns the transaction (so a failure rolls the
  whole seed back cleanly).

Audit events are emitted through the normal :func:`app.services.audit.record_event`
writer with a dedicated, clearly-labelled :class:`AuditContext` (actor = an
existing active Administrator; ``request_id`` prefixed ``seed-demo``).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.asset import Asset
from app.models.audit import AuditAction, AuditEntityType
from app.models.incident import Incident, IncidentAsset
from app.models.rbac import Role, UserRole
from app.models.relationship import AssetRelationship
from app.models.user import AccountStatus, User
from app.seeds._common import (
    SEED_REQUEST_PREFIX,
    SEED_USER_AGENT,
    SeedError,
    days_ago,
    seed_uuid,
    utcnow,
)
from app.seeds.assets import ASSET_SPECS, AssetSpec
from app.seeds.incidents import INCIDENT_SPECS, IncidentSpec
from app.seeds.relationships import RELATIONSHIP_SPECS, RelationshipSpec
from app.seeds.timeline import build_timeline
from app.services.audit import AuditContext, FieldChange, record_event
from app.services.users import get_by_email

_ADMIN_SLUG = "administrator"

# Demo pending access requests (Administration -> Access requests). Clearly
# demo-owned emails; created only if absent; never modified afterwards.
_DEMO_REQUESTS: tuple[tuple[str, float], ...] = (
    ("demo.request.morgan@example.com", 2.0),
    ("demo.request.priya@example.com", 6.0),
    ("demo.request.diego@example.com", 11.0),
)
# A syntactically valid passphrase for the demo pending accounts. They are
# `pending` and cannot authenticate; this is never printed.
_DEMO_REQUEST_PASSPHRASE = "demo-access-request-not-a-login"


@dataclass(slots=True)
class SeedSummary:
    admin_email: str
    assets_created: int = 0
    assets_existing: int = 0
    assets_live: int = 0
    assets_trash: int = 0
    incidents_created: int = 0
    incidents_existing: int = 0
    incidents_live: int = 0
    incidents_trash: int = 0
    relationships_created: int = 0
    timeline_events_created: int = 0
    audit_events_created: int = 0
    access_requests_created: int = 0
    access_requests_existing: int = 0
    asset_relationships_created: int = 0
    asset_relationships_existing: int = 0

    def render(self) -> str:
        return "\n".join(
            [
                "InfraGuard AI demo seed complete",
                "",
                f"Actor (audit): {self.admin_email}",
                "",
                "Assets:",
                f"  created:         {self.assets_created}",
                f"  already present: {self.assets_existing}",
                f"  live:            {self.assets_live}",
                f"  trash:           {self.assets_trash}",
                "",
                "Incidents:",
                f"  created:         {self.incidents_created}",
                f"  already present: {self.incidents_existing}",
                f"  live:            {self.incidents_live}",
                f"  trash:           {self.incidents_trash}",
                "",
                f"Incident -> asset relationships: {self.relationships_created}",
                f"Timeline events:                 {self.timeline_events_created}",
                f"Audit events:                    {self.audit_events_created}",
                "",
                "Asset relationships (topology):",
                f"  created:         {self.asset_relationships_created}",
                f"  already present: {self.asset_relationships_existing}",
                "  (run `docker compose run --rm sync-topology` to project into Neo4j)",
                "",
                "Access requests (pending):",
                f"  created:         {self.access_requests_created}",
                f"  already present: {self.access_requests_existing}",
            ]
        )


def find_seed_admin(db: Session) -> User:
    """Return the earliest active Administrator, or raise :class:`SeedError`."""
    user = db.execute(
        select(User)
        .join(UserRole, UserRole.user_id == User.id)
        .join(Role, Role.id == UserRole.role_id)
        .where(
            Role.slug == _ADMIN_SLUG,
            User.account_status == AccountStatus.ACTIVE.value,
        )
        .order_by(User.created_at.asc(), User.id.asc())
        .limit(1)
    ).scalar_one_or_none()
    if user is None:
        raise SeedError(
            "no active Administrator found - the demo seed needs one as the audit "
            "actor. Run `docker compose run --rm bootstrap` (or "
            "`python -m app.scripts.bootstrap_admin`) first."
        )
    return user


def _clamp_past(when: datetime, now: datetime) -> datetime:
    """Never let a derived timestamp land in the future."""
    latest = now - timedelta(minutes=1)
    return when if when < latest else latest


# --------------------------------------------------------------------------
# Assets
# --------------------------------------------------------------------------


def _seed_asset(
    db: Session, spec: AssetSpec, *, ctx: AuditContext, actor: User, now: datetime
) -> tuple[bool, int]:
    """Return ``(created, audit_events_written)``."""
    asset_id = seed_uuid("asset", spec.key)
    if db.get(Asset, asset_id) is not None:
        return False, 0

    created_at = days_ago(now, spec.created_days_ago, key=spec.key)
    updated_at = created_at
    audit = 0

    asset = Asset(
        id=asset_id,
        name=spec.name,
        asset_type=spec.asset_type,
        environment=spec.environment,
        criticality=spec.criticality,
        status=spec.status,
        hostname=spec.hostname,
        ip_address=spec.ip_address,
        owner=spec.owner,
        description=spec.description,
        is_active=spec.is_active,
        created_at=created_at,
        updated_at=updated_at,
    )

    if spec.trashed_days_ago is not None:
        asset.deleted_at = _clamp_past(days_ago(now, spec.trashed_days_ago, key=spec.key), now)
        asset.deleted_by = actor.id

    db.add(asset)
    db.flush()

    record_event(
        db,
        ctx=ctx,
        action=AuditAction.CREATE,
        entity_type=AuditEntityType.ASSET,
        entity_id=asset.id,
        entity_label=asset.name,
        metadata={
            "environment": spec.environment,
            "criticality": spec.criticality,
            "via": "seed-demo",
        },
        occurred_at=created_at,
    )
    audit += 1

    # A representative subset gets a later status-change UPDATE so the Assets
    # list and Audit timeline aren't purely creation events.
    if spec.status in ("Degraded", "Maintenance"):
        changed_at = _clamp_past(created_at + timedelta(days=20), now)
        asset.updated_at = changed_at
        db.add(asset)
        record_event(
            db,
            ctx=ctx,
            action=AuditAction.UPDATE,
            entity_type=AuditEntityType.ASSET,
            entity_id=asset.id,
            entity_label=asset.name,
            changes=[FieldChange("status", "Operational", spec.status)],
            occurred_at=changed_at,
        )
        audit += 1

    if spec.restored_days_ago is not None:
        deleted_at = _clamp_past(
            days_ago(now, spec.restored_days_ago + 3, key=spec.key + "d"), now
        )
        restored_at = _clamp_past(days_ago(now, spec.restored_days_ago, key=spec.key + "r"), now)
        record_event(
            db,
            ctx=ctx,
            action=AuditAction.DELETE,
            entity_type=AuditEntityType.ASSET,
            entity_id=asset.id,
            entity_label=asset.name,
            occurred_at=deleted_at,
        )
        record_event(
            db,
            ctx=ctx,
            action=AuditAction.RESTORE,
            entity_type=AuditEntityType.ASSET,
            entity_id=asset.id,
            entity_label=asset.name,
            occurred_at=restored_at,
        )
        asset.updated_at = max(asset.updated_at, restored_at)
        db.add(asset)
        audit += 2

    if spec.trashed_days_ago is not None:
        record_event(
            db,
            ctx=ctx,
            action=AuditAction.DELETE,
            entity_type=AuditEntityType.ASSET,
            entity_id=asset.id,
            entity_label=asset.name,
            occurred_at=asset.deleted_at,
        )
        audit += 1

    return True, audit


# --------------------------------------------------------------------------
# Incidents
# --------------------------------------------------------------------------


def _seed_incident(
    db: Session, spec: IncidentSpec, *, ctx: AuditContext, actor: User, now: datetime
) -> tuple[bool, int, int, int]:
    """Return ``(created, relationships, timeline_events, audit_events)``."""
    incident_id = seed_uuid("incident", spec.key)
    if db.get(Incident, incident_id) is not None:
        return False, 0, 0, 0

    asset_rows = [
        (key, seed_uuid("asset", key)) for key in spec.asset_keys
    ]
    known = {
        row.id: row.name
        for row in db.execute(
            select(Asset).where(Asset.id.in_([aid for _, aid in asset_rows]))
        ).scalars()
    }
    missing = [key for key, aid in asset_rows if aid not in known]
    if missing:
        raise SeedError(
            f"incident {spec.key!r} references unknown asset keys: {missing}"
        )
    ordered_assets = [(aid, known[aid]) for _, aid in asset_rows]

    started_at = days_ago(now, spec.started_days_ago, key=spec.key)
    incident = Incident(
        id=incident_id,
        title=spec.title,
        description=spec.description,
        severity=spec.severity,
        priority=spec.priority,
        status=spec.status,
        owner=spec.owner,
        created_by=actor.id,
        started_at=started_at,
        detected_at=started_at + timedelta(minutes=4),
        created_at=started_at,
    )
    db.add(incident)
    db.flush()

    built = build_timeline(
        incident_id=incident.id,
        spec=spec,
        started_at=started_at,
        asset_names=[name for _, name in ordered_assets],
        actor_id=actor.id,
    )
    db.add_all(built.events)

    first_added = next(
        (e.created_at for e in built.events if e.type == "ASSET_ADDED"), started_at
    )
    for aid, _name in ordered_assets:
        db.add(IncidentAsset(incident_id=incident.id, asset_id=aid, created_at=first_added))

    incident.resolved_at = built.resolved_at
    incident.updated_at = built.last_event_at
    if spec.trashed_days_ago is not None:
        incident.deleted_at = _clamp_past(
            days_ago(now, spec.trashed_days_ago, key=spec.key), now
        )
        incident.deleted_by = actor.id
    db.add(incident)
    db.flush()

    audit = 0
    record_event(
        db,
        ctx=ctx,
        action=AuditAction.CREATE,
        entity_type=AuditEntityType.INCIDENT,
        entity_id=incident.id,
        entity_label=incident.title,
        metadata={"severity": spec.severity, "priority": spec.priority, "via": "seed-demo"},
        occurred_at=started_at,
    )
    audit += 1

    if spec.status in ("Resolved", "Closed"):
        action = AuditAction.RESOLVED
        when = built.resolved_at or built.last_event_at
        record_event(
            db,
            ctx=ctx,
            action=action,
            entity_type=AuditEntityType.INCIDENT,
            entity_id=incident.id,
            entity_label=incident.title,
            changes=[FieldChange("status", "Open", spec.status)],
            occurred_at=_clamp_past(when, now),
        )
        audit += 1
    elif spec.path:
        record_event(
            db,
            ctx=ctx,
            action=AuditAction.STATUS_CHANGED,
            entity_type=AuditEntityType.INCIDENT,
            entity_id=incident.id,
            entity_label=incident.title,
            changes=[FieldChange("status", "Open", spec.status)],
            occurred_at=_clamp_past(built.last_event_at, now),
        )
        audit += 1

    if spec.trashed_days_ago is not None:
        record_event(
            db,
            ctx=ctx,
            action=AuditAction.DELETE,
            entity_type=AuditEntityType.INCIDENT,
            entity_id=incident.id,
            entity_label=incident.title,
            occurred_at=incident.deleted_at,
        )
        audit += 1

    return True, len(ordered_assets), len(built.events), audit


# --------------------------------------------------------------------------
# Asset relationships (Topology milestone)
# --------------------------------------------------------------------------


def _seed_asset_relationship(
    db: Session, spec: RelationshipSpec, *, ctx: AuditContext, now: datetime
) -> tuple[bool, int]:
    """Return ``(created, audit_events_written)``."""
    rel_id = seed_uuid("asset_relationship", spec.key)
    if db.get(AssetRelationship, rel_id) is not None:
        return False, 0

    source_id = seed_uuid("asset", spec.source_key)
    target_id = seed_uuid("asset", spec.target_key)
    source = db.get(Asset, source_id)
    target = db.get(Asset, target_id)
    if source is None or target is None:
        raise SeedError(
            f"relationship {spec.key!r} references an unknown asset key "
            f"({spec.source_key!r} -> {spec.target_key!r})"
        )

    created_at = _clamp_past(days_ago(now, 90, key=spec.key), now)
    rel = AssetRelationship(
        id=rel_id,
        source_asset_id=source.id,
        target_asset_id=target.id,
        relationship_type=spec.relationship_type,
        description=spec.description,
        created_by=None,
        created_at=created_at,
        updated_at=created_at,
    )
    db.add(rel)
    db.flush()

    record_event(
        db,
        ctx=ctx,
        action=AuditAction.CREATE,
        entity_type=AuditEntityType.RELATIONSHIP,
        entity_id=rel.id,
        entity_label=f"{source.name} {spec.relationship_type} {target.name}",
        metadata={
            "relationship_type": spec.relationship_type,
            "source_asset_id": str(source.id),
            "source_asset_name": source.name,
            "target_asset_id": str(target.id),
            "target_asset_name": target.name,
            "via": "seed-demo",
        },
        occurred_at=created_at,
    )
    return True, 1


# --------------------------------------------------------------------------
# Access requests
# --------------------------------------------------------------------------


def _seed_access_requests(
    db: Session, *, ctx: AuditContext, now: datetime
) -> tuple[int, int, int]:
    """Return ``(created, existing, audit_events)``."""
    from app.services.users import create_user

    created = existing = audit = 0
    for email, req_days_ago in _DEMO_REQUESTS:
        if get_by_email(db, email) is not None:
            existing += 1
            continue
        user = create_user(
            db,
            email=email,
            password=_DEMO_REQUEST_PASSPHRASE,
            account_status=AccountStatus.PENDING,
        )
        record_event(
            db,
            ctx=ctx,
            action=AuditAction.CREATE,
            entity_type=AuditEntityType.USER,
            entity_id=user.id,
            entity_label=user.email,
            metadata={"account_status": user.account_status, "via": "seed-demo"},
            occurred_at=_clamp_past(days_ago(now, req_days_ago, key=email), now),
        )
        created += 1
        audit += 1
    return created, existing, audit


# --------------------------------------------------------------------------
# Orchestration
# --------------------------------------------------------------------------


def run_seed(db: Session, *, now: datetime | None = None) -> SeedSummary:
    """Insert any missing demo data. Does not commit."""
    now = now or utcnow()
    admin = find_seed_admin(db)
    ctx = AuditContext(
        actor_user_id=admin.id,
        actor_email=admin.email,
        request_id=f"{SEED_REQUEST_PREFIX}-{now:%Y%m%dT%H%M%S}",
        ip_address=None,
        user_agent=SEED_USER_AGENT,
    )

    summary = SeedSummary(admin_email=admin.email)

    for spec in ASSET_SPECS:
        created, audit = _seed_asset(db, spec, ctx=ctx, actor=admin, now=now)
        if created:
            summary.assets_created += 1
        else:
            summary.assets_existing += 1
        summary.audit_events_created += audit

    for spec in INCIDENT_SPECS:
        created, rels, events, audit = _seed_incident(
            db, spec, ctx=ctx, actor=admin, now=now
        )
        if created:
            summary.incidents_created += 1
        else:
            summary.incidents_existing += 1
        summary.relationships_created += rels
        summary.timeline_events_created += events
        summary.audit_events_created += audit

    db.flush()  # asset ids must exist before relationship rows can reference them
    for spec in RELATIONSHIP_SPECS:
        created, audit = _seed_asset_relationship(db, spec, ctx=ctx, now=now)
        if created:
            summary.asset_relationships_created += 1
        else:
            summary.asset_relationships_existing += 1
        summary.audit_events_created += audit

    req_created, req_existing, req_audit = _seed_access_requests(db, ctx=ctx, now=now)
    summary.access_requests_created = req_created
    summary.access_requests_existing = req_existing
    summary.audit_events_created += req_audit

    db.flush()

    seed_asset_ids = [seed_uuid("asset", s.key) for s in ASSET_SPECS]
    seed_incident_ids = [seed_uuid("incident", s.key) for s in INCIDENT_SPECS]

    def _split(model, ids: list) -> tuple[int, int]:
        live = int(
            db.execute(
                select(func.count())
                .select_from(model)
                .where(model.id.in_(ids), model.deleted_at.is_(None))
            ).scalar_one()
        )
        trash = int(
            db.execute(
                select(func.count())
                .select_from(model)
                .where(model.id.in_(ids), model.deleted_at.is_not(None))
            ).scalar_one()
        )
        return live, trash

    summary.assets_live, summary.assets_trash = _split(Asset, seed_asset_ids)
    summary.incidents_live, summary.incidents_trash = _split(Incident, seed_incident_ids)
    return summary
