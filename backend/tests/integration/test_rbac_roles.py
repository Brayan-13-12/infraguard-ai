"""Role administration: system-role seed, custom-role lifecycle, safety rails."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integration

API = "/api/v1"
ROLES = f"{API}/admin/roles"
PERMISSIONS = f"{API}/admin/permissions"


def _role_by_slug(client: TestClient, slug: str) -> dict:
    items = client.get(ROLES).json()["items"]
    return next(r for r in items if r["slug"] == slug)


def test_permission_catalog_is_grouped(auth_client: TestClient) -> None:
    body = auth_client.get(PERMISSIONS).json()
    codes = {p["code"] for p in body["permissions"]}
    assert {"assets.read", "users.manage", "roles.manage", "audit.read"} <= codes
    assert "trash.purge" not in codes
    assert body["groups"] == ["assets", "incidents", "audit", "trash", "users", "roles", "ai"]
    assert all(p["group"] in body["groups"] for p in body["permissions"])


def test_the_four_system_roles_are_seeded(auth_client: TestClient) -> None:
    items = auth_client.get(ROLES).json()["items"]
    by_slug = {r["slug"]: r for r in items}
    assert {"administrator", "operator", "analyst", "viewer"} <= set(by_slug)
    for slug in ("administrator", "operator", "analyst", "viewer"):
        assert by_slug[slug]["is_system"] is True


def test_administrator_role_has_every_permission(auth_client: TestClient) -> None:
    admin_role = _role_by_slug(auth_client, "administrator")
    detail = auth_client.get(f"{ROLES}/{admin_role['id']}").json()
    catalog = {p["code"] for p in auth_client.get(PERMISSIONS).json()["permissions"]}
    assert set(detail["permissions"]) == catalog


@pytest.mark.parametrize(
    "slug,expected",
    [
        ("operator", {"assets.read", "assets.create", "assets.update", "incidents.read",
                      "incidents.create", "incidents.update", "incidents.resolve",
                      "trash.read", "trash.restore", "ai.use"}),
        ("analyst", {"assets.read", "incidents.read", "audit.read", "trash.read", "ai.use"}),
        ("viewer", {"assets.read", "incidents.read", "ai.use"}),
    ],
)
def test_system_role_permission_matrix(auth_client: TestClient, slug, expected) -> None:
    role = _role_by_slug(auth_client, slug)
    detail = auth_client.get(f"{ROLES}/{role['id']}").json()
    assert set(detail["permissions"]) == expected


def test_create_custom_role(auth_client: TestClient) -> None:
    resp = auth_client.post(
        ROLES,
        json={
            "name": "SRE Operator",
            "description": "On-call operations",
            "permissions": ["assets.read", "assets.update", "incidents.read",
                            "incidents.create", "incidents.update", "incidents.resolve",
                            "audit.read"],
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["is_system"] is False
    assert body["slug"] == "sre-operator"
    assert set(body["permissions"]) == {
        "assets.read", "assets.update", "incidents.read", "incidents.create",
        "incidents.update", "incidents.resolve", "audit.read",
    }


def test_create_role_rejects_unknown_permission(auth_client: TestClient) -> None:
    resp = auth_client.post(ROLES, json={"name": "Bad", "permissions": ["assets.teleport"]})
    assert resp.status_code == 422
    assert "unknown permission" in resp.json()["detail"].lower()


def test_rename_and_repermission_a_custom_role(auth_client: TestClient) -> None:
    rid = auth_client.post(
        ROLES, json={"name": "Draft", "permissions": ["assets.read"]}
    ).json()["id"]

    renamed = auth_client.patch(f"{ROLES}/{rid}", json={"name": "Renamed", "description": "d"})
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Renamed"
    assert renamed.json()["slug"] == "draft"  # slug is stable across renames

    perms = auth_client.put(
        f"{ROLES}/{rid}/permissions", json={"permissions": ["assets.read", "incidents.read"]}
    )
    assert perms.status_code == 200
    assert set(perms.json()["permissions"]) == {"assets.read", "incidents.read"}


def test_system_roles_cannot_be_edited_or_deleted(auth_client: TestClient) -> None:
    viewer = _role_by_slug(auth_client, "viewer")
    assert auth_client.patch(f"{ROLES}/{viewer['id']}", json={"name": "Nope"}).status_code == 409
    assert auth_client.put(
        f"{ROLES}/{viewer['id']}/permissions", json={"permissions": ["assets.read"]}
    ).status_code == 409
    assert auth_client.delete(f"{ROLES}/{viewer['id']}").status_code == 409
    # unchanged
    assert _role_by_slug(auth_client, "viewer")["name"] == "Viewer"


def test_custom_role_delete_when_unused(auth_client: TestClient) -> None:
    rid = auth_client.post(ROLES, json={"name": "Temp", "permissions": []}).json()["id"]
    assert auth_client.delete(f"{ROLES}/{rid}").status_code == 200
    assert auth_client.get(f"{ROLES}/{rid}").status_code == 404


def test_custom_role_delete_blocked_while_assigned(auth_client: TestClient, make_client) -> None:
    rid = auth_client.post(
        ROLES, json={"name": "Assigned", "permissions": ["assets.read"]}
    ).json()["id"]
    make_client("role-holder@example.com", roles=[])
    holder = auth_client.get(f"{API}/admin/users", params={"q": "role-holder"}).json()["items"][0]
    assert auth_client.put(
        f"{API}/admin/users/{holder['id']}/roles", json={"role_ids": [rid]}
    ).status_code == 200

    resp = auth_client.delete(f"{ROLES}/{rid}")
    assert resp.status_code == 409
    assert "assigned" in resp.json()["detail"].lower()


def test_roles_list_reports_counts_without_n_plus_1(auth_client: TestClient) -> None:
    rid = auth_client.post(
        ROLES, json={"name": "Counted", "permissions": ["assets.read", "incidents.read"]}
    ).json()["id"]
    row = next(r for r in auth_client.get(ROLES).json()["items"] if r["id"] == rid)
    assert row["permission_count"] == 2
    assert row["user_count"] == 0
