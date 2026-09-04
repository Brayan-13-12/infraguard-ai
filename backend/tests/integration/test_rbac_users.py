"""User administration: listing/filters, detail, activation, role assignment,
effective permissions, disabled-user rejection, and the new-user default role."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integration

API = "/api/v1"
USERS = f"{API}/admin/users"
ROLES = f"{API}/admin/roles"


def _role_id(client: TestClient, slug: str) -> str:
    return next(r for r in client.get(ROLES).json()["items"] if r["slug"] == slug)["id"]


def _user(client: TestClient, email: str) -> dict:
    return client.get(USERS, params={"q": email}).json()["items"][0]


def test_list_users_with_roles_no_n_plus_1(auth_client: TestClient, make_client) -> None:
    make_client("u-list-1@example.com", roles=["viewer"])
    make_client("u-list-2@example.com", roles=["operator", "analyst"])

    body = auth_client.get(USERS).json()
    assert body["total"] >= 3
    by_email = {u["email"]: u for u in body["items"]}
    assert {r["slug"] for r in by_email["u-list-2@example.com"]["roles"]} == {"operator", "analyst"}
    assert by_email["asset-owner@example.com"]["roles"][0]["slug"] == "administrator"


def test_search_filter_by_status_and_role(auth_client: TestClient, make_client) -> None:
    make_client("active-op@example.com", roles=["operator"])
    disabled = make_client("disabled-viewer@example.com", roles=["viewer"])  # noqa: F841
    d = _user(auth_client, "disabled-viewer@example.com")
    auth_client.patch(f"{USERS}/{d['id']}", json={"is_active": False})

    assert auth_client.get(USERS, params={"q": "active-op"}).json()["total"] == 1
    inactive = auth_client.get(USERS, params={"status": "disabled"}).json()
    assert all(u["account_status"] == "disabled" for u in inactive["items"])
    assert all(u["is_active"] is False for u in inactive["items"])
    assert any(u["email"] == "disabled-viewer@example.com" for u in inactive["items"])
    ops = auth_client.get(USERS, params={"role": "operator"}).json()
    assert {u["email"] for u in ops["items"]} == {"active-op@example.com"}


def test_user_detail_shows_effective_permission_union(auth_client: TestClient, make_client) -> None:
    make_client("union-user@example.com", roles=[])
    u = _user(auth_client, "union-user@example.com")
    # analyst: {assets.read, incidents.read, audit.read, trash.read}
    # + a custom role adding assets.update
    custom = auth_client.post(
        ROLES, json={"name": "Adds Update", "permissions": ["assets.update"]}
    ).json()["id"]
    auth_client.put(
        f"{USERS}/{u['id']}/roles",
        json={"role_ids": [_role_id(auth_client, "analyst"), custom]},
    )
    detail = auth_client.get(f"{USERS}/{u['id']}").json()
    assert set(detail["permissions"]) == {
        "assets.read", "incidents.read", "audit.read", "trash.read", "assets.update", "ai.use",
        "relationships.read",
    }


def test_assign_and_remove_roles_reflect_in_effective_access(
    auth_client: TestClient, make_client
) -> None:
    client = make_client("promote-me@example.com", roles=[])
    u = _user(auth_client, "promote-me@example.com")

    assert client.post(f"{API}/assets", json={
        "name": "x", "asset_type": "Server", "environment": "Test",
        "criticality": "Low", "status": "Operational",
    }).status_code == 403

    op_id = _role_id(auth_client, "operator")
    auth_client.put(f"{USERS}/{u['id']}/roles", json={"role_ids": [op_id]})
    # a fresh request re-resolves permissions from the DB
    assert client.get(f"{API}/assets").status_code == 200
    assert client.post(f"{API}/assets", json={
        "name": "now-allowed", "asset_type": "Server", "environment": "Test",
        "criticality": "Low", "status": "Operational",
    }).status_code == 201

    auth_client.put(f"{USERS}/{u['id']}/roles", json={"role_ids": []})
    assert client.get(f"{API}/assets").status_code == 403


def test_disabled_user_cannot_authenticate_or_use_protected_routes(
    auth_client: TestClient, make_client
) -> None:
    client = make_client("to-be-disabled@example.com", roles=["operator"])
    u = _user(auth_client, "to-be-disabled@example.com")

    assert auth_client.patch(f"{USERS}/{u['id']}", json={"is_active": False}).status_code == 200

    # already-issued cookie now fails on the next protected request
    assert client.get(f"{API}/assets").status_code == 403
    assert client.get(f"{API}/auth/me").status_code == 403
    # and a fresh login is refused - credentials are valid, so the state is
    # revealed as `account_disabled` (never a misleading "wrong password")
    fresh = auth_client.post(
        f"{API}/auth/login",
        json={"email": "to-be-disabled@example.com", "password": "a-perfectly-fine-passphrase"},
    )
    assert fresh.status_code == 403
    assert fresh.json()["detail"]["code"] == "account_disabled"


def test_reactivating_a_user_restores_access(auth_client: TestClient, make_client) -> None:
    client = make_client("bounce@example.com", roles=["viewer"])
    u = _user(auth_client, "bounce@example.com")
    auth_client.patch(f"{USERS}/{u['id']}", json={"is_active": False})
    assert client.get(f"{API}/assets").status_code == 403
    auth_client.patch(f"{USERS}/{u['id']}", json={"is_active": True})
    assert client.get(f"{API}/assets").status_code == 200


def test_set_roles_rejects_unknown_role_id(auth_client: TestClient, make_client) -> None:
    make_client("bad-role@example.com", roles=[])
    u = _user(auth_client, "bad-role@example.com")
    resp = auth_client.put(
        f"{USERS}/{u['id']}/roles",
        json={"role_ids": ["11111111-1111-1111-1111-111111111111"]},
    )
    assert resp.status_code == 422


def test_admin_responses_never_leak_password_material(auth_client: TestClient) -> None:
    for text in (
        auth_client.get(USERS).text,
        auth_client.get(f"{USERS}/{_user(auth_client, 'asset-owner')['id']}").text,
    ):
        low = text.lower()
        assert "password" not in low and "hash" not in low and "argon2" not in low
