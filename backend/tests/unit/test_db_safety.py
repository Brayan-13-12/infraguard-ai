"""The fail-closed guard for destructive database operations."""

from __future__ import annotations

import pytest

from app.core.db_safety import (
    DestructiveOperationRefused,
    disposable_opt_in,
    is_disposable_name,
    require_disposable_database,
)

MAIN = "postgresql+psycopg://infraguard:pw@db:5432/infraguard"
TEST = "postgresql+psycopg://infraguard:pw@localhost:55433/infraguard_test"
BARE_TEST = "postgresql+psycopg://t:t@localhost:5432/test"


@pytest.mark.parametrize(
    ("name", "ok"),
    [
        ("infraguard_test", True),
        ("test", True),
        ("INFRAGUARD_TEST", True),
        ("infraguard_migration_test", True),
        ("infraguard", False),
        ("postgres", False),
        ("infraguard_prod", False),
        ("", False),
    ],
)
def test_is_disposable_name(name: str, ok: bool) -> None:
    assert is_disposable_name(name) is ok


def test_opt_in_reads_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("INFRAGUARD_DISPOSABLE_DB", raising=False)
    assert disposable_opt_in() is False
    for truthy in ("1", "true", "YES", "on"):
        monkeypatch.setenv("INFRAGUARD_DISPOSABLE_DB", truthy)
        assert disposable_opt_in() is True
    monkeypatch.setenv("INFRAGUARD_DISPOSABLE_DB", "maybe")
    assert disposable_opt_in() is False


def test_allows_only_disposable_name_with_opt_in(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INFRAGUARD_DISPOSABLE_DB", "1")
    assert require_disposable_database(TEST, operation="unit test") == "infraguard_test"
    assert require_disposable_database(BARE_TEST, operation="unit test") == "test"


def test_refuses_main_database_even_with_opt_in(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INFRAGUARD_DISPOSABLE_DB", "1")
    with pytest.raises(DestructiveOperationRefused) as exc:
        require_disposable_database(MAIN, operation="schema reset")
    assert "not clearly disposable" in str(exc.value)
    assert "infraguard-ai_pgdata" in str(exc.value)


def test_refuses_disposable_name_without_opt_in(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("INFRAGUARD_DISPOSABLE_DB", raising=False)
    with pytest.raises(DestructiveOperationRefused) as exc:
        require_disposable_database(TEST, operation="schema reset")
    assert "INFRAGUARD_DISPOSABLE_DB" in str(exc.value)


def test_fails_closed_on_garbage_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INFRAGUARD_DISPOSABLE_DB", "1")
    with pytest.raises(DestructiveOperationRefused):
        require_disposable_database("not a url", operation="schema reset")
