"""Administrative changes are recorded in the existing audit log (entity types
``User`` / ``Role``) - and a *failed* mutation writes nothing."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integration

API = "/api/v1"
USERS = f"{API}/admin/users"
ROLES = f"{API}/admin/roles"
AUDIT = f"{API}/audit"


def _events(client: TestClient, **params) -> list[dict]:
    return client.get(AUDIT, params=params).json()["items"]


def _role_id(client: TestClient, slug: str) -> str:
    return next(r for r in client.get(ROLES).json()["items"] if r["slug"] == slug)["id"]


def test_user_activation_toggle_is_audited(
    auth_client: TestClient, make_client
) -> None:
    make_client("audit-target@example.com", roles=["viewer"])
    u = auth_client.get(USERS, params={"q": "audit-target"}).json()["items"][0]

    auth_client.patch(f"{USERS}/{u['id']}", json={"is_active": False})
    auth_client.patch(f"{USERS}/{u['id']}", json={"is_active": True})

    events = _events(auth_client, entity_id=u["id"], entity_type="User")
    actions = [e["action"] for e in events]
    assert actions.count("STATUS_CHANGED") == 2
    assert all(e["entity_type"] == "User" for e in events)
    detail = auth_client.get(f"{AUDIT}/{events[0]['id']}").json()
    fields = {c["field_name"] for c in detail["changes"]}
    assert fields == {"account_status"}


def test_role_assignment_change_is_audited_before_after(
    auth_client: TestClient, make_client
) -> None:
    make_client("audit-roles@example.com", roles=["viewer"])
    u = auth_client.get(USERS, params={"q": "audit-roles"}).json()["items"][0]

    auth_client.put(
        f"{USERS}/{u['id']}/roles",
        json={"role_ids": [_role_id(auth_client, "operator"), _role_id(auth_client, "analyst")]},
    )
    ev = _events(auth_client, entity_id=u["id"], entity_type="User", action="UPDATE")[0]
    detail = auth_client.get(f"{AUDIT}/{ev['id']}").json()
    change = next(c for c in detail["changes"] if c["field_name"] == "roles")
    assert "viewer" in change["old_value"]
    assert "operator" in change["new_value"] and "analyst" in change["new_value"]


def test_custom_role_lifecycle_is_audited(auth_client: TestClient) -> None:
    created = auth_client.post(
        ROLES, json={"name": "Audited Role", "permissions": ["assets.read"]}
    ).json()
    rid = created["id"]
    auth_client.patch(f"{ROLES}/{rid}", json={"name": "Audited Role v2"})
    auth_client.put(
        f"{ROLES}/{rid}/permissions",
        json={"permissions": ["assets.read", "incidents.read"]},
    )
    auth_client.delete(f"{ROLES}/{rid}")

    events = _events(auth_client, entity_id=rid, entity_type="Role")
    actions = {e["action"] for e in events}
    assert {"CREATE", "UPDATE", "PERMISSION_CHANGED", "DELETE"} <= actions


def test_role_permission_change_records_added_removed(auth_client: TestClient) -> None:
    rid = auth_client.post(
        ROLES, json={"name": "PermDiff", "permissions": ["assets.read", "incidents.read"]}
    ).json()["id"]
    auth_client.put(
        f"{ROLES}/{rid}/permissions",
        json={"permissions": ["assets.read", "audit.read"]},
    )

    ev = _events(auth_client, entity_id=rid, action="PERMISSION_CHANGED")[0]
    detail = auth_client.get(f"{AUDIT}/{ev['id']}").json()
    change = next(c for c in detail["changes"] if c["field_name"] == "permissions")
    assert "incidents.read" in change["old_value"]
    assert "audit.read" in change["new_value"]


def test_no_audit_event_when_nothing_changed(auth_client: TestClient, make_client) -> None:
    make_client("noop-audit@example.com", roles=["viewer"])
    u = auth_client.get(USERS, params={"q": "noop-audit"}).json()["items"][0]
    before = len(_events(auth_client, entity_id=u["id"]))
    auth_client.patch(f"{USERS}/{u['id']}", json={"is_active": True})  # already active
    assert len(_events(auth_client, entity_id=u["id"])) == before


def test_failed_role_delete_writes_no_audit_event(auth_client: TestClient) -> None:
    viewer_id = _role_id(auth_client, "viewer")
    auth_client.delete(f"{ROLES}/{viewer_id}")  # 409 - system role
    events = _events(auth_client, entity_id=viewer_id, entity_type="Role")
    assert not any(e["action"] == "DELETE" for e in events)


def test_admin_audit_never_leaks_secrets(auth_client: TestClient, make_client) -> None:
    make_client("secret-check@example.com", roles=["viewer"])
    u = auth_client.get(USERS, params={"q": "secret-check"}).json()["items"][0]
    auth_client.patch(f"{USERS}/{u['id']}", json={"is_active": False})
    dump = auth_client.get(AUDIT, params={"page_size": 100}).text.lower()
    assert "password" not in dump and "passphrase" not in dump and "argon2" not in dump
