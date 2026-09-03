"""The official demo-data seeder: additive, idempotent, non-destructive.

Runs inside the standard per-test transaction (rolled back afterwards), so it
never leaves demo data behind - it is exercising ``run_seed`` against a real
PostgreSQL, not seeding the test database for other suites.
"""

from __future__ import annotations

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.asset import Asset
from app.models.audit import AuditEvent
from app.models.incident import Incident, IncidentAsset, IncidentEvent
from app.models.rbac import UserRole
from app.models.user import AccountStatus, User
from app.seeds._common import SeedError, seed_uuid
from app.seeds.runner import run_seed
from app.services.assets import AssetQuery, get_asset_summary, list_assets
from app.services.incidents import IncidentQuery, get_incident_summary, list_incidents
from app.services.rbac import role_by_slug
from app.services.trash import trash_summary
from app.services.users import create_user, get_by_email

pytestmark = pytest.mark.integration

_PW = "a-perfectly-fine-passphrase"


def _make_admin(db: Session, email: str = "seed-admin@example.com") -> User:
    user = create_user(db, email=email, password=_PW, account_status=AccountStatus.ACTIVE)
    db.add(UserRole(user_id=user.id, role_id=role_by_slug(db, "administrator").id))
    db.flush()
    return user


def _count(db: Session, model) -> int:
    return int(db.execute(select(func.count()).select_from(model)).scalar_one())


# --- Happy path -------------------------------------------------------

def test_first_run_creates_the_demo_dataset(db_session: Session) -> None:
    _make_admin(db_session)
    summary = run_seed(db_session)

    assert 60 <= summary.assets_created <= 80
    assert 25 <= summary.incidents_created <= 35
    assert summary.relationships_created > 0
    assert summary.timeline_events_created > summary.incidents_created
    assert summary.audit_events_created > 0
    assert summary.access_requests_created == 3
    assert summary.assets_trash >= 3
    assert summary.incidents_trash >= 2
    assert summary.assets_live == summary.assets_created - summary.assets_trash


def test_second_run_is_a_no_op(db_session: Session) -> None:
    _make_admin(db_session)
    run_seed(db_session)
    before = (
        _count(db_session, Asset),
        _count(db_session, Incident),
        _count(db_session, IncidentAsset),
        _count(db_session, IncidentEvent),
        _count(db_session, AuditEvent),
        _count(db_session, User),
    )

    second = run_seed(db_session)
    after = (
        _count(db_session, Asset),
        _count(db_session, Incident),
        _count(db_session, IncidentAsset),
        _count(db_session, IncidentEvent),
        _count(db_session, AuditEvent),
        _count(db_session, User),
    )
    assert before == after
    assert second.assets_created == 0
    assert second.incidents_created == 0
    assert second.audit_events_created == 0
    assert second.access_requests_created == 0
    assert second.assets_existing >= 60


# --- Coexistence with real data -------------------------------------

def test_manual_records_and_users_survive(db_session: Session) -> None:
    admin = _make_admin(db_session)
    original_hash = admin.password_hash
    original_status = admin.account_status
    original_roles = {r.role_id for r in db_session.execute(
        select(UserRole).where(UserRole.user_id == admin.id)
    ).scalars()}

    manual = Asset(
        name="my-hand-made-asset",
        asset_type="Server",
        environment="Production",
        criticality="High",
        status="Operational",
    )
    db_session.add(manual)
    db_session.flush()
    manual_id = manual.id

    run_seed(db_session)
    run_seed(db_session)  # twice, for good measure

    survived = db_session.get(Asset, manual_id)
    assert survived is not None and survived.name == "my-hand-made-asset"

    db_session.refresh(admin)
    assert admin.password_hash == original_hash
    assert admin.account_status == original_status == AccountStatus.ACTIVE.value
    roles_now = {r.role_id for r in db_session.execute(
        select(UserRole).where(UserRole.user_id == admin.id)
    ).scalars()}
    assert roles_now == original_roles

    # the demo pending users are additive and clearly namespaced
    demo = get_by_email(db_session, "demo.request.morgan@example.com")
    assert demo is not None and demo.account_status == AccountStatus.PENDING.value


# --- Trash / relationships / dashboard ------------------------------

def test_trashed_records_are_hidden_from_normal_lists_but_in_trash(db_session: Session) -> None:
    _make_admin(db_session)
    run_seed(db_session)

    live_assets, live_total = list_assets(db_session, AssetQuery(page=1, page_size=100))
    assert all(a.deleted_at is None for a in live_assets)

    ts = trash_summary(db_session)
    assert ts["assets"] >= 3
    assert ts["incidents"] >= 2

    # a known trashed asset: excluded from list, present via primary key
    trashed_id = seed_uuid("asset", "dev-sandbox-01")
    row = db_session.get(Asset, trashed_id)
    assert row is not None and row.deleted_at is not None
    assert trashed_id not in {a.id for a in live_assets}

    live_incidents, _ = list_incidents(db_session, IncidentQuery(page=1, page_size=100))
    assert all(i.deleted_at is None for (i, _c) in live_incidents)


def test_relationships_are_valid(db_session: Session) -> None:
    _make_admin(db_session)
    run_seed(db_session)

    orphan_links = db_session.execute(
        select(func.count())
        .select_from(IncidentAsset)
        .outerjoin(Asset, Asset.id == IncidentAsset.asset_id)
        .where(Asset.id.is_(None))
    ).scalar_one()
    assert orphan_links == 0

    # every seeded incident with a CREATED event also has a well-formed timeline
    events_without_incident = db_session.execute(
        select(func.count())
        .select_from(IncidentEvent)
        .outerjoin(Incident, Incident.id == IncidentEvent.incident_id)
        .where(Incident.id.is_(None))
    ).scalar_one()
    assert events_without_incident == 0


def test_dashboard_summaries_reflect_the_seed(db_session: Session) -> None:
    _make_admin(db_session)
    run_seed(db_session)

    a = get_asset_summary(db_session)
    assert a["total"] > 0
    assert a["by_criticality"]["Critical"] > 0
    assert sum(1 for v in a["by_environment"].values() if v > 0) >= 3
    assert sum(1 for v in a["by_status"].values() if v > 0) >= 3

    i = get_incident_summary(db_session)
    assert i["total"] > 0
    assert i["open"] > 0
    assert i["critical_open"] > 0
    assert i["by_severity"]["Critical"] > 0
    assert sum(1 for v in i["by_status"].values() if v > 0) >= 4


def test_pagination_needs_multiple_pages(db_session: Session) -> None:
    _make_admin(db_session)
    run_seed(db_session)

    _items, asset_total = list_assets(db_session, AssetQuery(page=1, page_size=20))
    assert asset_total > 20  # Assets list is 20/page -> multi-page

    _its, incident_total = list_incidents(db_session, IncidentQuery(page=1, page_size=15))
    assert incident_total > 15  # Incidents list is 15/page -> multi-page


# --- Fails safely without an actor ---------------------------------

def test_seed_fails_safely_without_an_active_admin(db_session: Session) -> None:
    assert _count(db_session, User) == 0
    with pytest.raises(SeedError) as exc:
        run_seed(db_session)
    assert "bootstrap" in str(exc.value).lower()
    # nothing was written
    assert _count(db_session, Asset) == 0
    assert _count(db_session, Incident) == 0


def test_disabled_admin_is_not_accepted_as_actor(db_session: Session) -> None:
    user = create_user(
        db_session, email="dis@example.com", password=_PW, account_status=AccountStatus.DISABLED
    )
    db_session.add(UserRole(user_id=user.id, role_id=role_by_slug(db_session, "administrator").id))
    db_session.flush()
    with pytest.raises(SeedError):
        run_seed(db_session)
