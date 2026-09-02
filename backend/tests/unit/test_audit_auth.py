"""Audit API access + shape guarantees that need no database.

* every audit endpoint rejects an unauthenticated request with 401;
* the audit log is **append-only through the API**: no POST / PUT / PATCH /
  DELETE route exists for it.
"""

from __future__ import annotations

import pytest

BASE = "/api/v1/audit"
FAKE_ID = "11111111-1111-1111-1111-111111111111"

_READS = [
    ("get", BASE),
    ("get", f"{BASE}/summary"),
    ("get", f"{BASE}/{FAKE_ID}"),
]


@pytest.mark.parametrize("method,path", _READS)
def test_audit_read_requires_authentication(client_factory, method: str, path: str) -> None:
    resp = getattr(client_factory(), method)(path)
    assert resp.status_code == 401
    assert "Not authenticated" in resp.text


@pytest.mark.parametrize("method", ["post", "put", "patch", "delete"])
@pytest.mark.parametrize("path", [BASE, f"{BASE}/{FAKE_ID}"])
def test_audit_is_append_only_no_write_routes(client_factory, method: str, path: str) -> None:
    resp = client_factory().request(method, path)
    # 405 (route path exists for GET only) or 404 (no such path at all) - never
    # 200/201. A write endpoint would authenticate first and return 401 here.
    assert resp.status_code in (404, 405)


def test_audit_openapi_exposes_only_reads() -> None:
    from app.main import app

    paths = app.openapi()["paths"]
    assert set(paths[f"{BASE}"]) == {"get"}
    assert set(paths[f"{BASE}/summary"]) == {"get"}
    assert set(paths[f"{BASE}/{{event_id}}"]) == {"get"}
