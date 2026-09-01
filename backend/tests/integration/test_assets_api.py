"""Integration tests for the Assets API against a real PostgreSQL."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integration

ASSETS = "/api/v1/assets"

BASE_ASSET = {
    "name": "web-01",
    "asset_type": "Server",
    "environment": "Production",
    "criticality": "Critical",
    "status": "Operational",
}


def _create(client: TestClient, **overrides) -> dict:
    payload = {**BASE_ASSET, **overrides}
    resp = client.post(ASSETS, json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


# --- Create ---------------------------------------------------------------

def test_create_returns_the_asset(auth_client: TestClient) -> None:
    body = _create(auth_client, name="api-gateway", owner="platform-team", ip_address="10.0.0.5")
    assert body["name"] == "api-gateway"
    assert body["owner"] == "platform-team"
    assert body["ip_address"] == "10.0.0.5"
    assert body["is_active"] is True
    assert set(body) == {
        "id", "name", "asset_type", "environment", "criticality", "status",
        "hostname", "ip_address", "owner", "description", "is_active",
        "created_at", "updated_at",
    }


def test_create_rejects_invalid_enum(auth_client: TestClient) -> None:
    resp = auth_client.post(ASSETS, json={**BASE_ASSET, "criticality": "Severe"})
    assert resp.status_code == 422


def test_create_rejects_invalid_ip(auth_client: TestClient) -> None:
    resp = auth_client.post(ASSETS, json={**BASE_ASSET, "ip_address": "10.0.0.999"})
    assert resp.status_code == 422


def test_create_rejects_missing_required_field(auth_client: TestClient) -> None:
    payload = dict(BASE_ASSET)
    del payload["name"]
    assert auth_client.post(ASSETS, json=payload).status_code == 422


def test_create_rejects_unknown_field(auth_client: TestClient) -> None:
    assert auth_client.post(ASSETS, json={**BASE_ASSET, "region": "eu"}).status_code == 422


def test_create_from_foreign_origin_is_blocked(auth_client: TestClient) -> None:
    resp = auth_client.post(ASSETS, json=BASE_ASSET, headers={"Origin": "https://evil.example"})
    assert resp.status_code == 403


# --- Get ---------------------------------------------------------------

def test_get_existing_asset(auth_client: TestClient) -> None:
    created = _create(auth_client)
    resp = auth_client.get(f"{ASSETS}/{created['id']}")
    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]


def test_get_missing_asset_is_404(auth_client: TestClient) -> None:
    resp = auth_client.get(f"{ASSETS}/11111111-1111-1111-1111-111111111111")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Asset not found"


# --- List / pagination / search / filters --------------------------------

def test_list_is_paginated_with_metadata(auth_client: TestClient) -> None:
    for i in range(5):
        _create(auth_client, name=f"host-{i}")

    resp = auth_client.get(ASSETS, params={"page": 1, "page_size": 2})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["items"]) == 2
    assert body["page"] == 1
    assert body["page_size"] == 2
    assert body["total"] == 5
    assert body["total_pages"] == 3

    page3 = auth_client.get(ASSETS, params={"page": 3, "page_size": 2}).json()
    assert len(page3["items"]) == 1


def test_list_page_size_is_capped(auth_client: TestClient) -> None:
    assert auth_client.get(ASSETS, params={"page_size": 1000}).status_code == 422


def test_search_matches_name_hostname_owner_ip(auth_client: TestClient) -> None:
    _create(auth_client, name="billing-service")
    _create(auth_client, name="other", hostname="billing.internal.example")
    _create(auth_client, name="third", owner="billing-team")
    _create(auth_client, name="fourth", ip_address="10.9.9.9")

    assert auth_client.get(ASSETS, params={"q": "billing"}).json()["total"] == 3
    assert auth_client.get(ASSETS, params={"q": "10.9.9.9"}).json()["total"] == 1


def test_search_treats_wildcards_literally(auth_client: TestClient) -> None:
    _create(auth_client, name="plain-host")
    # A "%" term must not match everything.
    assert auth_client.get(ASSETS, params={"q": "%"}).json()["total"] == 0


@pytest.mark.parametrize(
    "param,value,other",
    [
        ("asset_type", "Database", {"asset_type": "Server"}),
        ("environment", "Staging", {"environment": "Production"}),
        ("criticality", "Low", {"criticality": "Critical"}),
        ("status", "Offline", {"status": "Operational"}),
    ],
)
def test_filter_by_catalog_field(auth_client: TestClient, param, value, other) -> None:
    _create(auth_client, name="match", **{param: value})
    _create(auth_client, name="nomatch", **other)
    body = auth_client.get(ASSETS, params={param: value}).json()
    assert body["total"] == 1
    assert body["items"][0]["name"] == "match"


def test_filter_by_active_state(auth_client: TestClient) -> None:
    a = _create(auth_client, name="live")
    b = _create(auth_client, name="retired")
    auth_client.post(f"{ASSETS}/{b['id']}/deactivate")

    active = auth_client.get(ASSETS, params={"is_active": "true"}).json()
    inactive = auth_client.get(ASSETS, params={"is_active": "false"}).json()
    assert [x["name"] for x in active["items"]] == ["live"]
    assert [x["name"] for x in inactive["items"]] == ["retired"]
    assert {a["id"], b["id"]}  # both still exist


def test_filter_rejects_invalid_enum(auth_client: TestClient) -> None:
    assert auth_client.get(ASSETS, params={"environment": "Prod"}).status_code == 422


# --- Update ----------------------------------------------------------------

def test_patch_updates_only_sent_fields(auth_client: TestClient) -> None:
    created = _create(auth_client, owner="old-team")
    resp = auth_client.patch(
        f"{ASSETS}/{created['id']}", json={"status": "Degraded", "description": "under load"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "Degraded"
    assert body["description"] == "under load"
    assert body["owner"] == "old-team"  # untouched
    assert body["updated_at"] >= created["updated_at"]


def test_patch_missing_asset_is_404(auth_client: TestClient) -> None:
    resp = auth_client.patch(
        f"{ASSETS}/11111111-1111-1111-1111-111111111111", json={"status": "Offline"}
    )
    assert resp.status_code == 404


def test_patch_rejects_unknown_field(auth_client: TestClient) -> None:
    created = _create(auth_client)
    resp = auth_client.patch(f"{ASSETS}/{created['id']}", json={"is_active": False})
    assert resp.status_code == 422


def test_patch_rejects_invalid_ip(auth_client: TestClient) -> None:
    created = _create(auth_client)
    assert (
        auth_client.patch(f"{ASSETS}/{created['id']}", json={"ip_address": "nope"}).status_code
        == 422
    )


# --- Deactivate / reactivate --------------------------------------------

def test_deactivate_then_reactivate(auth_client: TestClient) -> None:
    created = _create(auth_client)

    d = auth_client.post(f"{ASSETS}/{created['id']}/deactivate")
    assert d.status_code == 200 and d.json()["is_active"] is False

    r = auth_client.post(f"{ASSETS}/{created['id']}/reactivate")
    assert r.status_code == 200 and r.json()["is_active"] is True


def test_deactivate_is_idempotent(auth_client: TestClient) -> None:
    created = _create(auth_client)
    first = auth_client.post(f"{ASSETS}/{created['id']}/deactivate").json()
    second = auth_client.post(f"{ASSETS}/{created['id']}/deactivate").json()
    assert first["is_active"] is False and second["is_active"] is False
    assert first["updated_at"] == second["updated_at"]  # no-op, timestamp unchanged


def test_deactivate_missing_asset_is_404(auth_client: TestClient) -> None:
    resp = auth_client.post(f"{ASSETS}/11111111-1111-1111-1111-111111111111/deactivate")
    assert resp.status_code == 404


# --- Auth ---------------------------------------------------------------

def test_unauthenticated_list_is_401(client: TestClient) -> None:
    assert client.get(ASSETS).status_code == 401


def test_unauthenticated_create_is_401(client: TestClient) -> None:
    assert client.post(ASSETS, json=BASE_ASSET).status_code == 401


# --- DB error sanitisation --------------------------------------------

def test_list_when_database_errors_is_generic_503(auth_client: TestClient, monkeypatch) -> None:
    from sqlalchemy.exc import OperationalError

    def _boom(*_a, **_k):
        raise OperationalError("SELECT", {}, Exception("connection refused"))

    monkeypatch.setattr("app.api.v1.routes.assets.list_assets", _boom)
    resp = auth_client.get(ASSETS)
    assert resp.status_code == 503
    lowered = resp.text.lower()
    for marker in ("psycopg", "traceback", "operationalerror", "connection refused"):
        assert marker not in lowered
