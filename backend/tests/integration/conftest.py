"""Fixtures for integration tests that need a real PostgreSQL.

Discovery & safety
------------------
* ``TEST_DATABASE_URL`` **absent**  -> every test here is skipped (the fast unit
  suite still runs anywhere).
* ``TEST_DATABASE_URL`` **set**     -> it must pass the test-only database guard
  (:mod:`tests.dbguard`: name is ``test`` or ends with ``_test``) *and* the
  database must be reachable. Either failing makes the whole suite **fail** -
  a configured integration run must never silently skip (important in CI).

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
