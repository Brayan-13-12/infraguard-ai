"""The RBAC permission matrix, enforced by the backend.

For every protected operation:

* unauthenticated              -> 401
* authenticated, missing perm  -> 403  (never 401, never a redirect)
* authenticated, has the perm  -> success (2xx)

The frontend only mirrors this; the backend is the security boundary.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integration

API = "/api/v1"
FAKE = "11111111-1111-1111-1111-111111111111"

_ASSET = {
    "name": "perm-matrix-asset",
    "asset_type": "Server",
    "environment": "Test",
    "criticality": "Low",
    "status": "Operational",
}


@pytest.fixture
def admin(auth_client: TestClient) -> TestClient:
    return auth_client


@pytest.fixture
def viewer(make_client) -> TestClient:
    return make_client("viewer-matrix@example.com", roles=["viewer"])


@pytest.fixture
def no_perms(make_client) -> TestClient:
    return make_client("noperms-matrix@example.com", roles=[])


def _call(client: TestClient, method: str, path: str, body):
    return (
        getattr(client, method)(path, json=body)
        if body is not None
        else getattr(client, method)(path)
    )


def _seed_ids(admin: TestClient) -> dict[str, str]:
    asset = admin.post(f"{API}/assets", json=_ASSET).json()
    inc = admin.post(
        f"{API}/incidents",
        json={"title": "perm matrix incident", "severity": "Low", "priority": "P4"},
    ).json()
    role = admin.post(
        f"{API}/admin/roles", json={"name": "Matrix Role", "permissions": ["assets.read"]}
    ).json()
    me = admin.get(f"{API}/auth/me").json()
    return {"asset": asset["id"], "incident": inc["id"], "role": role["id"], "me": me["id"]}


# (method, path_tmpl, json, required_permission)
_MATRIX = [
    ("get", "{API}/assets", None, "assets.read"),
    ("get", "{API}/assets/summary", None, "assets.read"),
    ("get", "{API}/assets/{asset}", None, "assets.read"),
    ("post", "{API}/assets", _ASSET, "assets.create"),
    ("patch", "{API}/assets/{asset}", {"criticality": "High"}, "assets.update"),
    ("post", "{API}/assets/{asset}/deactivate", None, "assets.update"),
    ("delete", "{API}/assets/{asset}", None, "assets.delete"),
    ("get", "{API}/incidents", None, "incidents.read"),
    ("get", "{API}/incidents/summary", None, "incidents.read"),
    ("get", "{API}/incidents/{incident}", None, "incidents.read"),
    ("post", "{API}/incidents", {"title": "x", "severity": "Low", "priority": "P4"},
     "incidents.create"),
    ("patch", "{API}/incidents/{incident}", {"title": "y"}, "incidents.update"),
    ("post", "{API}/incidents/{incident}/comments", {"message": "note"}, "incidents.update"),
    ("post", "{API}/incidents/{incident}/resolve", None, "incidents.resolve"),
    ("post", "{API}/incidents/{incident}/reopen", None, "incidents.resolve"),
    ("delete", "{API}/incidents/{incident}", None, "incidents.delete"),
    ("get", "{API}/audit", None, "audit.read"),
    ("get", "{API}/audit/summary", None, "audit.read"),
    ("get", "{API}/trash/summary", None, "trash.read"),
    ("get", "{API}/trash/assets", None, "trash.read"),
    ("get", "{API}/trash/incidents", None, "trash.read"),
    ("get", "{API}/admin/users", None, "users.read"),
    ("get", "{API}/admin/users/{me}", None, "users.read"),
    ("patch", "{API}/admin/users/{me}", {"is_active": True}, "users.manage"),
    ("put", "{API}/admin/users/{me}/roles", {"role_ids": []}, "users.manage"),
    ("get", "{API}/admin/roles", None, "roles.read"),
    ("get", "{API}/admin/permissions", None, "roles.read"),
    ("post", "{API}/admin/roles", {"name": "z", "permissions": []}, "roles.manage"),
    ("patch", "{API}/admin/roles/{role}", {"name": "zz"}, "roles.manage"),
    ("put", "{API}/admin/roles/{role}/permissions", {"permissions": []}, "roles.manage"),
    ("delete", "{API}/admin/roles/{role}", None, "roles.manage"),
]


@pytest.mark.parametrize("method,tmpl,body,perm", _MATRIX)
def test_missing_permission_is_403_not_401(
    admin: TestClient, no_perms: TestClient, method, tmpl, body, perm
) -> None:
    ids = _seed_ids(admin)
    path = tmpl.format(API=API, **ids)
    resp = _call(no_perms, method, path, body)
    assert resp.status_code == 403, (perm, path, resp.status_code, resp.text)
    assert "permission" in resp.json()["detail"].lower()


@pytest.mark.parametrize("method,tmpl,body,perm", _MATRIX)
def test_holder_of_the_permission_is_allowed(
    admin: TestClient, method, tmpl, body, perm
) -> None:
    ids = _seed_ids(admin)
    path = tmpl.format(API=API, **ids)
    resp = _call(admin, method, path, body)
    assert resp.status_code not in (401, 403), (perm, path, resp.status_code, resp.text)


@pytest.mark.parametrize("method,tmpl,body,perm", _MATRIX)
def test_unauthenticated_is_401(client: TestClient, method, tmpl, body, perm) -> None:
    path = tmpl.format(API=API, asset=FAKE, incident=FAKE, role=FAKE, me=FAKE)
    resp = _call(client, method, path, body)
    assert resp.status_code == 401, (path, resp.status_code)


def test_viewer_can_read_assets_and_incidents_only(viewer: TestClient) -> None:
    assert viewer.get(f"{API}/assets").status_code == 200
    assert viewer.get(f"{API}/incidents").status_code == 200
    assert viewer.post(f"{API}/assets", json=_ASSET).status_code == 403
    assert viewer.get(f"{API}/audit").status_code == 403
    assert viewer.get(f"{API}/trash/summary").status_code == 403
    assert viewer.get(f"{API}/admin/users").status_code == 403
