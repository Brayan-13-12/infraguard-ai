"""Unit tests for the Incident request/response schemas. Pure Pydantic."""

from __future__ import annotations

import uuid

import pytest
from pydantic import ValidationError

from app.models.incident import DESCRIPTION_MAX_LENGTH, TITLE_MAX_LENGTH
from app.schemas.incident import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    IncidentCreate,
    IncidentListItem,
    IncidentRead,
    IncidentSummary,
    IncidentUpdate,
)

VALID = {"title": "Database outage", "severity": "Critical", "priority": "P1"}


def test_incident_list_default_page_size_is_15() -> None:
    assert DEFAULT_PAGE_SIZE == 15
    assert MAX_PAGE_SIZE == 100


def test_minimal_valid_payload_defaults_status_open() -> None:
    inc = IncidentCreate(**VALID)
    assert inc.title == "Database outage"
    assert inc.status == "Open"
    assert inc.asset_ids == []
    assert inc.owner is None


def test_title_is_trimmed_and_blank_rejected() -> None:
    assert IncidentCreate(**{**VALID, "title": "  x  "}).title == "x"
    with pytest.raises(ValidationError):
        IncidentCreate(**{**VALID, "title": "   "})


@pytest.mark.parametrize(
    "field,bad",
    [
        ("severity", "Severe"),
        ("priority", "P9"),
        ("status", "Wontfix"),
    ],
)
def test_invalid_enum_rejected(field: str, bad: str) -> None:
    with pytest.raises(ValidationError):
        IncidentCreate(**{**VALID, field: bad})


def test_unknown_field_rejected() -> None:
    with pytest.raises(ValidationError):
        IncidentCreate(**{**VALID, "root_cause": "dns"})
    with pytest.raises(ValidationError):
        IncidentUpdate(created_by=str(uuid.uuid4()))
    with pytest.raises(ValidationError):
        IncidentUpdate(resolved_at="2026-09-01T00:00:00Z")


def test_asset_ids_are_deduped() -> None:
    a = uuid.uuid4()
    inc = IncidentCreate(**{**VALID, "asset_ids": [str(a), str(a)]})
    assert inc.asset_ids == [a]


def test_asset_ids_capped() -> None:
    with pytest.raises(ValidationError):
        IncidentCreate(**{**VALID, "asset_ids": [str(uuid.uuid4()) for _ in range(201)]})


def test_title_length_limit() -> None:
    with pytest.raises(ValidationError):
        IncidentCreate(**{**VALID, "title": "x" * (TITLE_MAX_LENGTH + 1)})


def test_description_length_limit() -> None:
    with pytest.raises(ValidationError):
        IncidentCreate(**{**VALID, "description": "x" * (DESCRIPTION_MAX_LENGTH + 1)})


def test_update_is_fully_optional() -> None:
    assert IncidentUpdate().model_dump(exclude_unset=True) == {}


def test_update_partial_roundtrip() -> None:
    upd = IncidentUpdate(status="Investigating", owner="  sre-oncall ")
    assert upd.model_dump(exclude_unset=True) == {
        "status": "Investigating",
        "owner": "sre-oncall",
    }


def test_update_asset_ids_none_vs_empty_are_distinguishable() -> None:
    assert "asset_ids" not in IncidentUpdate().model_dump(exclude_unset=True)
    assert IncidentUpdate(asset_ids=[]).model_dump(exclude_unset=True) == {"asset_ids": []}


def test_list_item_and_read_field_sets() -> None:
    assert set(IncidentListItem.model_fields) == {
        "id",
        "title",
        "severity",
        "status",
        "priority",
        "owner",
        "started_at",
        "detected_at",
        "resolved_at",
        "affected_asset_count",
        "created_at",
        "updated_at",
    }
    assert "description" in IncidentRead.model_fields
    assert "affected_assets" in IncidentRead.model_fields
    assert "timeline" in IncidentRead.model_fields


def test_summary_rejects_negative() -> None:
    with pytest.raises(ValidationError):
        IncidentSummary(
            total=-1,
            open=0,
            critical_open=0,
            investigating=0,
            monitoring=0,
            resolved_recently=0,
            by_severity={},
            by_status={},
        )
