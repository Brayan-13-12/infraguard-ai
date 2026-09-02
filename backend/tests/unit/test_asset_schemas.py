"""Unit tests for the Asset request/response schemas.

Pure Pydantic - no database. Covers enum validation, IP parsing, length limits,
whitespace normalisation and the ``extra="forbid"`` rejection of unknown fields.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models.asset import DESCRIPTION_MAX_LENGTH, NAME_MAX_LENGTH
from app.schemas.asset import AssetCreate, AssetRead, AssetSummary, AssetUpdate

VALID = {
    "name": "web-01",
    "asset_type": "Server",
    "environment": "Production",
    "criticality": "Critical",
    "status": "Operational",
}


def test_minimal_valid_payload() -> None:
    asset = AssetCreate(**VALID)
    assert asset.name == "web-01"
    assert asset.asset_type == "Server"
    assert asset.hostname is None
    assert asset.ip_address is None


def test_name_is_trimmed() -> None:
    assert AssetCreate(**{**VALID, "name": "  web-01  "}).name == "web-01"


def test_blank_name_rejected() -> None:
    with pytest.raises(ValidationError):
        AssetCreate(**{**VALID, "name": "   "})


def test_missing_required_field_rejected() -> None:
    payload = dict(VALID)
    del payload["criticality"]
    with pytest.raises(ValidationError):
        AssetCreate(**payload)


@pytest.mark.parametrize(
    "field,bad",
    [
        ("asset_type", "Toaster"),
        ("environment", "Prod"),
        ("criticality", "Severe"),
        ("status", "Broken"),
    ],
)
def test_invalid_enum_value_rejected(field: str, bad: str) -> None:
    with pytest.raises(ValidationError):
        AssetCreate(**{**VALID, field: bad})


@pytest.mark.parametrize("ip", ["10.0.0.5", "192.168.1.1", "2001:db8::1", "::1"])
def test_valid_ip_accepted_and_normalised(ip: str) -> None:
    import ipaddress

    asset = AssetCreate(**{**VALID, "ip_address": ip})
    assert asset.ip_address == str(ipaddress.ip_address(ip))


@pytest.mark.parametrize("ip", ["not-an-ip", "10.0.0.999", "999.999.999.999", "1.2.3"])
def test_invalid_ip_rejected(ip: str) -> None:
    with pytest.raises(ValidationError):
        AssetCreate(**{**VALID, "ip_address": ip})


def test_empty_optional_strings_become_none() -> None:
    asset = AssetCreate(**{**VALID, "hostname": "   ", "owner": "", "description": " "})
    assert asset.hostname is None
    assert asset.owner is None
    assert asset.description is None


def test_name_length_limit() -> None:
    with pytest.raises(ValidationError):
        AssetCreate(**{**VALID, "name": "x" * (NAME_MAX_LENGTH + 1)})


def test_description_length_limit() -> None:
    with pytest.raises(ValidationError):
        AssetCreate(**{**VALID, "description": "x" * (DESCRIPTION_MAX_LENGTH + 1)})


def test_unknown_field_rejected_on_create() -> None:
    with pytest.raises(ValidationError):
        AssetCreate(**{**VALID, "region": "eu-west-1"})


def test_unknown_field_rejected_on_update() -> None:
    with pytest.raises(ValidationError):
        AssetUpdate(is_active=False)  # lifecycle is not an update field
    with pytest.raises(ValidationError):
        AssetUpdate(nope="x")


def test_update_is_fully_optional() -> None:
    upd = AssetUpdate()
    assert upd.model_dump(exclude_unset=True) == {}


def test_update_partial_roundtrip() -> None:
    upd = AssetUpdate(status="Degraded", owner="  platform-team ")
    assert upd.model_dump(exclude_unset=True) == {"status": "Degraded", "owner": "platform-team"}


def test_asset_read_exposes_no_unexpected_fields() -> None:
    fields = set(AssetRead.model_fields)
    assert fields == {
        "id",
        "name",
        "asset_type",
        "environment",
        "criticality",
        "status",
        "hostname",
        "ip_address",
        "owner",
        "description",
        "is_active",
        "created_at",
        "updated_at",
    }


def test_asset_summary_shape() -> None:
    summary = AssetSummary(
        total=3,
        active=2,
        inactive=1,
        by_criticality={"Critical": 1, "High": 0, "Medium": 2, "Low": 0},
        by_status={"Operational": 3, "Degraded": 0, "Maintenance": 0, "Offline": 0},
        by_environment={"Production": 3, "Staging": 0, "Development": 0, "Test": 0},
        by_type={"Server": 3},
    )
    assert set(AssetSummary.model_fields) == {
        "total",
        "active",
        "inactive",
        "by_criticality",
        "by_status",
        "by_environment",
        "by_type",
    }
    assert summary.by_criticality["Medium"] == 2


def test_asset_summary_rejects_negative_totals() -> None:
    with pytest.raises(ValidationError):
        AssetSummary(
            total=-1,
            active=0,
            inactive=0,
            by_criticality={},
            by_status={},
            by_environment={},
            by_type={},
        )
