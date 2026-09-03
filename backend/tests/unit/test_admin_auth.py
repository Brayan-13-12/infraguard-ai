"""Every admin endpoint rejects an unauthenticated request with 401 before
touching the database (fake-session client, no real DB)."""

from __future__ import annotations

import pytest

BASE = "/api/v1/admin"
FAKE = "11111111-1111-1111-1111-111111111111"

_REQUESTS = [
    ("get", f"{BASE}/permissions", None),
    ("get", f"{BASE}/users", None),
    ("get", f"{BASE}/users/{FAKE}", None),
    ("get", f"{BASE}/users/{FAKE}/roles", None),
    ("patch", f"{BASE}/users/{FAKE}", {"is_active": False}),
    ("put", f"{BASE}/users/{FAKE}/roles", {"role_ids": []}),
    ("get", f"{BASE}/roles", None),
    ("post", f"{BASE}/roles", {"name": "X", "permissions": []}),
    ("get", f"{BASE}/roles/{FAKE}", None),
    ("patch", f"{BASE}/roles/{FAKE}", {"name": "Y"}),
    ("delete", f"{BASE}/roles/{FAKE}", None),
    ("put", f"{BASE}/roles/{FAKE}/permissions", {"permissions": []}),
]


@pytest.mark.parametrize("method,path,body", _REQUESTS)
def test_admin_endpoint_requires_authentication(client_factory, method, path, body) -> None:
    client = client_factory()
    resp = (
        getattr(client, method)(path, json=body)
        if body is not None
        else getattr(client, method)(path)
    )
    assert resp.status_code == 401
    assert "Not authenticated" in resp.text


def test_admin_openapi_paths_exist() -> None:
    from app.main import app

    paths = app.openapi()["paths"]
    for p in (
        f"{BASE}/users",
        f"{BASE}/users/{{user_id}}",
        f"{BASE}/users/{{user_id}}/roles",
        f"{BASE}/roles",
        f"{BASE}/roles/{{role_id}}",
        f"{BASE}/roles/{{role_id}}/permissions",
        f"{BASE}/permissions",
    ):
        assert p in paths, p
