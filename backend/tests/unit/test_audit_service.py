"""Unit tests for the audit serialisation / scrubbing helpers (no database).

These guard the promises that matter most for a governance log:

* a sensitive field name never yields a stored value (only ``[redacted]``);
* ``old_value`` / ``new_value`` are always bounded, JSON-safe scalars;
* ``diff_fields`` reports exactly the fields that changed (incl. null<->value).
"""

from __future__ import annotations

import enum
import uuid
from datetime import UTC, datetime

import pytest

from app.models.audit import REDACTED, SENSITIVE_FIELD_TOKENS, VALUE_MAX_LENGTH
from app.services.audit import (
    FieldChange,
    _scrub_metadata,
    _serialize_change,
    diff_fields,
    is_sensitive_field,
    serialize_audit_value,
)


class _Colour(enum.StrEnum):
    RED = "Red"


# --- is_sensitive_field --------------------------------------------------


@pytest.mark.parametrize(
    "name",
    [
        "password",
        "password_hash",
        "PasswordHash",
        "user_token",
        "jwt",
        "refresh_token",
        "api_key",
        "apiKey",
        "authorization",
        "session_id",
        "client_secret",
        "cookie",
    ],
)
def test_sensitive_field_names_are_flagged(name: str) -> None:
    assert is_sensitive_field(name) is True


@pytest.mark.parametrize("name", ["name", "status", "owner", "hostname", "ip_address", "title"])
def test_ordinary_field_names_are_not_flagged(name: str) -> None:
    assert is_sensitive_field(name) is False


def test_every_denylist_token_matches_itself() -> None:
    for token in SENSITIVE_FIELD_TOKENS:
        assert is_sensitive_field(token)


# --- _serialize_change: sensitive values never persisted ----------------


def test_serialize_change_redacts_sensitive_field_values() -> None:
    row = _serialize_change(FieldChange("password", "hunter2", "correct-horse"))
    assert row.old_value == REDACTED
    assert row.new_value == REDACTED
    assert "hunter2" not in (row.old_value or "")
    assert "correct-horse" not in (row.new_value or "")


def test_serialize_change_keeps_ordinary_values() -> None:
    row = _serialize_change(FieldChange("status", "Operational", "Degraded"))
    assert row.old_value == "Operational"
    assert row.new_value == "Degraded"


# --- serialize_audit_value ---------------------------------------------


def test_serialize_none_stays_none() -> None:
    assert serialize_audit_value(None) is None


def test_serialize_bool_is_lowercase_word() -> None:
    assert serialize_audit_value(True) == "true"
    assert serialize_audit_value(False) == "false"


def test_serialize_enum_uses_value() -> None:
    assert serialize_audit_value(_Colour.RED) == "Red"


def test_serialize_uuid_and_datetime() -> None:
    u = uuid.uuid4()
    assert serialize_audit_value(u) == str(u)
    dt = datetime(2026, 9, 2, 10, 0, tzinfo=UTC)
    assert serialize_audit_value(dt) == dt.isoformat()


def test_serialize_numbers() -> None:
    assert serialize_audit_value(3) == "3"
    assert serialize_audit_value(2.5) == "2.5"


def test_serialize_list_joins_scalars() -> None:
    assert serialize_audit_value(["web-01", "db-01"]) == "web-01, db-01"


def test_serialize_truncates_overlong_text() -> None:
    out = serialize_audit_value("x" * (VALUE_MAX_LENGTH + 500))
    assert out is not None
    assert len(out) == VALUE_MAX_LENGTH
    assert out.endswith("…")


# --- diff_fields ------------------------------------------------------


def test_diff_reports_only_changed_fields() -> None:
    before = {"a": 1, "b": "x", "c": None}
    after = {"a": 1, "b": "y", "c": "now-set"}
    changes = diff_fields(before, after, ["a", "b", "c"])
    assert [c.field for c in changes] == ["b", "c"]


def test_diff_handles_value_to_null() -> None:
    changes = diff_fields({"owner": "sre"}, {"owner": None}, ["owner"])
    assert changes == [FieldChange("owner", "sre", None)]


def test_diff_ignores_fields_not_requested() -> None:
    changes = diff_fields({"a": 1}, {"a": 2}, [])
    assert changes == []


# --- _scrub_metadata -------------------------------------------------


def test_scrub_metadata_redacts_sensitive_keys_recursively() -> None:
    scrubbed = _scrub_metadata(
        {
            "severity": "High",
            "password": "hunter2",
            "nested": {"api_key": "abc123", "keep": "ok"},
            "list": [{"token": "t0k"}],
        }
    )
    assert scrubbed["severity"] == "High"
    assert scrubbed["password"] == REDACTED
    assert scrubbed["nested"]["api_key"] == REDACTED
    assert scrubbed["nested"]["keep"] == "ok"
    assert scrubbed["list"][0]["token"] == REDACTED


def test_scrub_metadata_caps_depth() -> None:
    deep: dict = {}
    cur = deep
    for _ in range(10):
        cur["child"] = {}
        cur = cur["child"]
    # Should not raise and should terminate.
    assert _scrub_metadata(deep) is not None


def test_scrub_metadata_stringifies_unknown_objects() -> None:
    class Weird:
        def __str__(self) -> str:
            return "weird-repr"

    assert _scrub_metadata({"x": Weird()}) == {"x": "weird-repr"}
