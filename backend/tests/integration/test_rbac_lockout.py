"""Administrative-lockout protection: the system can never reach zero active
Administrators, and an admin cannot lock *themselves* out while they are the last
one. The check runs under a row lock (see app/services/rbac._active_admin_ids)."""

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


def _set_roles(client: TestClient, uid: str, *slugs: str):
    return client.put(
        f"{USERS}/{uid}/roles",
        json={"role_ids": [_role_id(client, s) for s in slugs]},
    )


def _my_role_slugs(client: TestClient) -> set[str]:
    return {r["slug"] for r in client.get(f"{API}/auth/me").json()["roles"]}


def test_last_admin_cannot_deactivate_themselves(auth_client: TestClient) -> None:
    me = auth_client.get(f"{API}/auth/me").json()
    resp = auth_client.patch(f"{USERS}/{me['id']}", json={"is_active": False})
    assert resp.status_code == 409
    assert "administrator" in resp.json()["detail"].lower()
    assert auth_client.get(f"{API}/auth/me").json()["is_active"] is True


def test_last_admin_cannot_drop_their_own_administrator_role(auth_client: TestClient) -> None:
    me = auth_client.get(f"{API}/auth/me").json()
    resp = _set_roles(auth_client, me["id"], "viewer")
    assert resp.status_code == 409
    assert _my_role_slugs(auth_client) == {"administrator"}


def test_cannot_deactivate_the_only_admin_even_a_different_one(
    auth_client: TestClient, make_client
) -> None:
    # promote a second user, then demote the original -> second is now the only admin
    second = make_client("second-admin@example.com", roles=[])
    s = _user(auth_client, "second-admin@example.com")
    _set_roles(auth_client, s["id"], "administrator")

    me = auth_client.get(f"{API}/auth/me").json()
    assert auth_client.put(
        f"{USERS}/{me['id']}/roles", json={"role_ids": []}
    ).status_code == 200

    # now `second` is the last admin - they cannot be deactivated by anyone
    resp = second.patch(f"{USERS}/{s['id']}", json={"is_active": False})
    assert resp.status_code == 409


def test_with_a_second_active_admin_the_first_can_step_down(
    auth_client: TestClient, make_client
) -> None:
    make_client("co-admin@example.com", roles=[])
    co = _user(auth_client, "co-admin@example.com")
    _set_roles(auth_client, co["id"], "administrator")

    me = auth_client.get(f"{API}/auth/me").json()
    # two active admins -> the original may now deactivate themselves
    assert auth_client.patch(f"{USERS}/{me['id']}", json={"is_active": False}).status_code == 200


def test_deactivating_one_of_two_admins_then_the_other_is_blocked(
    auth_client: TestClient, make_client
) -> None:
    make_client("admin-b@example.com", roles=[])
    b = _user(auth_client, "admin-b@example.com")
    _set_roles(auth_client, b["id"], "administrator")

    assert auth_client.patch(f"{USERS}/{b['id']}", json={"is_active": False}).status_code == 200
    me = auth_client.get(f"{API}/auth/me").json()
    assert auth_client.patch(f"{USERS}/{me['id']}", json={"is_active": False}).status_code == 409


def test_failed_lockout_mutation_leaves_authorization_intact(auth_client: TestClient) -> None:
    me = auth_client.get(f"{API}/auth/me").json()
    auth_client.patch(f"{USERS}/{me['id']}", json={"is_active": False})  # -> 409, rolled back
    detail = auth_client.get(f"{USERS}/{me['id']}").json()
    assert detail["is_active"] is True
    assert "users.manage" in detail["permissions"]
    assert detail["is_last_active_admin"] is True


def test_no_false_audit_event_for_a_blocked_lockout(auth_client: TestClient) -> None:
    me = auth_client.get(f"{API}/auth/me").json()
    auth_client.patch(f"{USERS}/{me['id']}", json={"is_active": False})  # 409
    events = auth_client.get(f"{API}/audit", params={"entity_id": me["id"]}).json()["items"]
    assert not any(e["action"] == "STATUS_CHANGED" for e in events)
