"""AI tool layer - registry invariants, input validation, executor authorization.
No database: this covers the safety properties that must hold regardless of data.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.services.ai.tools import (
    REGISTRY,
    SearchAssetsInput,
    SearchAuditInput,
    ToolExecutor,
    ToolInputError,
    ToolPermissionError,
    UnknownToolError,
)

#: A read tool's verb (first name segment) is one of these - never a mutation.
_READ_VERBS = {"search", "get", "summarize", "list", "count"}
_MUTATION_VERBS = {
    "create", "update", "delete", "restore", "resolve", "reopen", "approve",
    "reject", "set", "add", "remove", "run", "exec", "write",
}


def test_every_tool_is_read_only_and_permission_gated() -> None:
    assert REGISTRY, "registry must not be empty"
    for name, tool in REGISTRY.items():
        assert name == tool.name
        assert tool.permission.endswith(".read"), name
        verb = name.split("_", 1)[0]
        assert verb in _READ_VERBS, name
        assert verb not in _MUTATION_VERBS, name
        assert tool.description and tool.input_model is not None


def test_tool_permissions_are_only_read_domains() -> None:
    perms = {t.permission for t in REGISTRY.values()}
    assert perms <= {"assets.read", "incidents.read", "audit.read"}


def test_input_models_forbid_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        SearchAssetsInput.model_validate({"drop_table": "users"})


def test_input_models_bound_query_length_and_limit() -> None:
    with pytest.raises(ValidationError):
        SearchAssetsInput.model_validate({"query": "x" * 500})
    with pytest.raises(ValidationError):
        SearchAssetsInput.model_validate({"limit": 9999})
    with pytest.raises(ValidationError):
        SearchAuditInput.model_validate({"entity_id": "x" * 500})
    # sane input is accepted
    ok = SearchAssetsInput.model_validate(
        {"query": "prod", "criticality": ["Critical"], "limit": 5}
    )
    assert ok.limit == 5


def test_input_models_validate_enums() -> None:
    with pytest.raises(ValidationError):
        SearchAssetsInput.model_validate({"criticality": ["Nope"]})
    with pytest.raises(ValidationError):
        SearchAssetsInput.model_validate({"environment": "Mars"})


def test_executor_available_tools_track_permissions() -> None:
    none = ToolExecutor(db=None, permissions=frozenset())  # type: ignore[arg-type]
    assert none.available() == []
    assert none.can("search_assets") is False

    assets_only = ToolExecutor(db=None, permissions=frozenset({"assets.read"}))  # type: ignore[arg-type]
    names = {t.name for t in assets_only.available()}
    assert "search_assets" in names
    assert "search_audit" not in names
    assert assets_only.can("search_audit") is False


def test_executor_refuses_a_tool_the_caller_lacks() -> None:
    ex = ToolExecutor(db=None, permissions=frozenset({"assets.read"}))  # type: ignore[arg-type]
    with pytest.raises(ToolPermissionError) as exc:
        ex.call("search_audit", {})
    assert exc.value.permission == "audit.read"


def test_executor_rejects_unknown_tool_and_bad_input() -> None:
    ex = ToolExecutor(db=None, permissions=frozenset({"assets.read"}))  # type: ignore[arg-type]
    with pytest.raises(UnknownToolError):
        ex.call("run_sql", {})
    with pytest.raises(ToolInputError):
        ex.call("search_assets", {"limit": 100000})
