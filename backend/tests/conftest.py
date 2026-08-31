"""Pytest fixtures.

Tests never touch a real database. The `get_db` dependency is overridden with a
lightweight fake session whose behaviour (healthy / unhealthy) each test picks.
"""

from __future__ import annotations

import os
from collections.abc import Callable, Iterator

import pytest

# Force a non-production environment before any application import so the
# production fail-safety validator never runs during tests.
os.environ["ENVIRONMENT"] = "test"

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.exc import OperationalError  # noqa: E402

from app.db.session import get_db  # noqa: E402
from app.main import app  # noqa: E402


class FakeSession:
    """Minimal stand-in for a SQLAlchemy Session used by the health check."""

    def __init__(self, *, healthy: bool = True) -> None:
        self._healthy = healthy

    def execute(self, *_args: object, **_kwargs: object) -> object:
        if not self._healthy:
            raise OperationalError("SELECT 1", {}, Exception("connection refused"))
        return object()

    def close(self) -> None:  # pragma: no cover - trivial
        pass


ClientFactory = Callable[..., TestClient]


@pytest.fixture
def client_factory() -> Iterator[ClientFactory]:
    def _make(*, db_healthy: bool = True) -> TestClient:
        def _override() -> Iterator[FakeSession]:
            yield FakeSession(healthy=db_healthy)

        app.dependency_overrides[get_db] = _override
        return TestClient(app, raise_server_exceptions=True)

    yield _make
    app.dependency_overrides.clear()
