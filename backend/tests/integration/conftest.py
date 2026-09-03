"""Fixtures for integration tests that need a real PostgreSQL.

Discovery & safety
------------------
* ``TEST_DATABASE_URL`` **absent**  -> every test here is skipped (the fast unit
  suite still runs anywhere).
* ``TEST_DATABASE_URL`` **set**     -> it must pass the test-only database guard
  (:mod:`tests.dbguard`) *and* the database must be reachable. The guard requires
  **both** ``INFRAGUARD_DISPOSABLE_DB`` set truthy (explicit opt-in) **and** a
  disposable name (``test`` / ``*_test``, and not the app's own database). Any
  of those failing makes the whole suite **fail** - a configured integration run
  must never silently skip (important in CI). Use the throwaway ``db-test``
  Compose service (``docker compose --profile test up -d db-test``,
  ``127.0.0.1:55433``), never the main ``db``.

Isolation: each test runs inside an outer transaction that is rolled back at the
end. Route code may call ``db.commit()``; ``join_transaction_mode="create_savepoint"``
turns that into a savepoint release so nothing escapes the test.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.core.config import settings
from tests.dbguard import (
    UnreachableTestDatabase,
    UnsafeTestDatabase,
    assert_test_database,
    verify_reachable,
)

pytestmark = pytest.mark.integration

_TEST_DB_URL = os.environ.get("TEST_DATABASE_URL")


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    if not _TEST_DB_URL:
        pytest.skip("TEST_DATABASE_URL not set - integration tests skipped")

    # Fail fast (never skip) if a URL was provided but is unsafe or unreachable.
    try:
        assert_test_database(_TEST_DB_URL, app_database_url=settings.DATABASE_URL)
        verify_reachable(_TEST_DB_URL)
    except (UnsafeTestDatabase, UnreachableTestDatabase) as exc:
        pytest.fail(
            f"{exc}. A configured integration run must not be skipped.", pytrace=False
        )

    eng = create_engine(_TEST_DB_URL, pool_pre_ping=True, future=True)

    from app.db.registry import Base

    Base.metadata.drop_all(eng)
    Base.metadata.create_all(eng)

    # Seed the RBAC catalog + system roles once for the whole session, committed
    # (outside the per-test rollback), exactly as the Alembic migration does in a
    # real deployment. Without this, `bootstrap_user_roles` finds no roles and a
    # freshly registered user would have zero permissions.
    from app.services.rbac import seed_rbac

    with Session(eng) as seed_session:
        seed_rbac(seed_session)
        seed_session.commit()

    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture
def db_session(engine: Engine) -> Iterator[Session]:
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(
        bind=connection,
        join_transaction_mode="create_savepoint",
        expire_on_commit=False,
    )
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(db_session: Session) -> Iterator[TestClient]:
    from app.api.deps import reset_rate_limiters
    from app.db.session import get_db
    from app.main import app

    reset_rate_limiters()

    def _override_get_db() -> Iterator[Session]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    # A trusted browser origin so require_trusted_origin passes for POSTs.
    with TestClient(app, base_url="http://localhost:8000") as test_client:
        test_client.headers.update({"Origin": "http://localhost:3000"})
        yield test_client
    app.dependency_overrides.clear()
    reset_rate_limiters()


_PW = "a-perfectly-fine-passphrase"


def _provision(db: Session, email: str, roles: list[str]) -> None:
    """Turn a freshly-registered ``pending`` account into an ``active`` one with
    an explicit role set - the direct equivalent of an administrator approving
    it, done on the test session so the change is visible to the request path."""
    from sqlalchemy import delete

    from app.models.rbac import UserRole
    from app.models.user import AccountStatus
    from app.services.rbac import role_by_slug
    from app.services.users import get_by_email

    user = get_by_email(db, email)
    assert user is not None
    user.account_status = AccountStatus.ACTIVE.value
    db.execute(delete(UserRole).where(UserRole.user_id == user.id))
    for slug in roles:
        role = role_by_slug(db, slug)
        assert role is not None, f"unknown role slug: {slug}"
        db.add(UserRole(user_id=user.id, role_id=role.id))
    db.flush()


@pytest.fixture
def make_client(client: TestClient, db_session: Session):
    """Factory: register + activate + role + log in a user. Returns a fresh
    ``TestClient``.

    Public registration only creates a ``pending`` account now, so the fixture
    provisions it directly (``roles`` defaults to ``["viewer"]``; pass
    ``roles=["administrator"]``, ``roles=["operator", "analyst"]``, ``roles=[]``
    for an active-but-permissionless account, etc.).
    """
    from app.main import app

    created: list[TestClient] = []

    def _make(email: str, *, roles: list[str] | None = None) -> TestClient:
        assert (
            client.post(
                "/api/v1/auth/register", json={"email": email, "password": _PW}
            ).status_code
            == 201
        )
        _provision(db_session, email, ["viewer"] if roles is None else roles)

        sub = TestClient(app, base_url="http://localhost:8000")
        sub.headers.update({"Origin": "http://localhost:3000"})
        assert (
            sub.post(
                "/api/v1/auth/login", json={"email": email, "password": _PW}
            ).status_code
            == 200
        ), f"login failed for {email}"
        created.append(sub)
        return sub

    yield _make
    for c in created:
        c.close()


@pytest.fixture
def auth_client(client: TestClient, db_session: Session) -> TestClient:
    """A ``client`` logged in as an **active Administrator** - the baseline the
    Assets / Incidents / Audit / Trash suites were written against."""
    creds = {"email": "asset-owner@example.com", "password": _PW}
    assert client.post("/api/v1/auth/register", json=creds).status_code == 201
    _provision(db_session, creds["email"], ["administrator"])
    assert client.post("/api/v1/auth/login", json=creds).status_code == 200
    return client


@pytest.fixture
def admin_client(auth_client: TestClient) -> TestClient:
    """Explicit alias for :func:`auth_client` - a logged-in Administrator."""
    return auth_client
