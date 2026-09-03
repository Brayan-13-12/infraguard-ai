"""Unit tests for the integration-test database safety guard."""

from __future__ import annotations

import pytest

from tests.dbguard import (
    UnreachableTestDatabase,
    UnsafeTestDatabase,
    assert_test_database,
    verify_reachable,
)

_PREFIX = "postgresql+psycopg://u:p@localhost:5432/"


@pytest.fixture(autouse=True)
def _opt_in(monkeypatch: pytest.MonkeyPatch) -> None:
    """Most cases assume the operator has opted in; the dedicated test below
    checks the opt-in requirement itself."""
    monkeypatch.setenv("INFRAGUARD_DISPOSABLE_DB", "1")


def test_requires_the_disposable_opt_in(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("INFRAGUARD_DISPOSABLE_DB", raising=False)
    with pytest.raises(UnsafeTestDatabase, match="INFRAGUARD_DISPOSABLE_DB"):
        assert_test_database(_PREFIX + "infraguard_test")


@pytest.mark.parametrize("name", ["infraguard_test", "test", "ci_test", "app_int_test", "X_TEST"])
def test_accepts_clear_test_database_names(name: str) -> None:
    assert assert_test_database(_PREFIX + name) == name


@pytest.mark.parametrize(
    "name",
    ["infraguard", "postgres", "production", "testing", "test_db", "app", ""],
)
def test_rejects_non_test_database_names(name: str) -> None:
    with pytest.raises(UnsafeTestDatabase):
        assert_test_database(_PREFIX + name)


def test_rejects_a_malformed_url() -> None:
    with pytest.raises(UnsafeTestDatabase):
        assert_test_database("not a url at all")


def test_rejects_when_it_matches_the_application_database() -> None:
    with pytest.raises(UnsafeTestDatabase, match="application's own"):
        assert_test_database(
            _PREFIX + "shared_test",
            app_database_url="postgresql+psycopg://u:p@db:5432/shared_test",
        )


def test_allows_a_distinct_test_database_alongside_the_app_database() -> None:
    assert (
        assert_test_database(
            _PREFIX + "infraguard_test",
            app_database_url="postgresql+psycopg://u:p@db:5432/infraguard",
        )
        == "infraguard_test"
    )


def test_verify_reachable_raises_for_an_unreachable_database() -> None:
    # A configured-but-unreachable test DB must RAISE (the fixture turns this
    # into a hard failure, never a skip).
    with pytest.raises(UnreachableTestDatabase):
        verify_reachable(
            "postgresql+psycopg://u:p@127.0.0.1:1/nope_test", timeout_seconds=2
        )
