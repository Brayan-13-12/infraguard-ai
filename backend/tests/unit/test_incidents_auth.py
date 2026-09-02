"""Every incident endpoint must reject an unauthenticated request with 401
before touching the database. Uses the fake-session client (no real DB).
"""

from __future__ import annotations

import pytest

BASE = "/api/v1/incidents"
FAKE_ID = "11111111-1111-1111-1111-111111111111"

_REQUESTS = [
    ("get", BASE, None),
    ("get", f"{BASE}/summary", None),
    ("get", f"{BASE}/{FAKE_ID}", None),
    (
        "post",
        BASE,
        {"title": "x", "severity": "High", "priority": "P2"},
    ),
    ("patch", f"{BASE}/{FAKE_ID}", {"status": "Investigating"}),
    ("post", f"{BASE}/{FAKE_ID}/resolve", None),
    ("post", f"{BASE}/{FAKE_ID}/reopen", None),
    ("post", f"{BASE}/{FAKE_ID}/comments", {"message": "hi"}),
]


@pytest.mark.parametrize("method,path,body", _REQUESTS)
def test_endpoint_requires_authentication(client_factory, method: str, path: str, body) -> None:
    client = client_factory()
    resp = getattr(client, method)(path, json=body) if body else getattr(client, method)(path)
    assert resp.status_code == 401
    assert "Not authenticated" in resp.text


@pytest.mark.parametrize("method,path,body", _REQUESTS)
def test_malformed_token_is_401(client_factory, method: str, path: str, body) -> None:
    client = client_factory()
    client.cookies.set("infraguard_access", "not-a-jwt")
    resp = getattr(client, method)(path, json=body) if body else getattr(client, method)(path)
    assert resp.status_code == 401
    for marker in ("secret", "hash", "traceback"):
        assert marker not in resp.text.lower()


def test_incidents_openapi_is_documented(client_factory) -> None:
    schema = client_factory().get("/openapi.json").json()
    assert "/api/v1/incidents" in schema["paths"]
    assert "/api/v1/incidents/summary" in schema["paths"]
    assert "/api/v1/incidents/{incident_id}" in schema["paths"]
    assert "/api/v1/incidents/{incident_id}/resolve" in schema["paths"]
    assert "/api/v1/incidents/{incident_id}/reopen" in schema["paths"]
