"""AI Assistant - context-aware entry points. A context id from the client is
never trusted: the backend re-fetches the entity and enforces the domain read
permission."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integration

API = "/api/v1"
CONV = f"{API}/ai/conversations"


def _asset(admin: TestClient, name: str = "prod-ctx-01") -> str:
    return admin.post(
        f"{API}/assets",
        json={
            "name": name,
            "asset_type": "Server",
            "environment": "Production",
            "criticality": "High",
            "status": "Operational",
        },
    ).json()["id"]


def test_conversation_with_valid_asset_context(auth_client: TestClient, make_client) -> None:
    asset_id = _asset(auth_client)
    client = make_client("ai-ctx@example.com", roles=["viewer"])

    conv = client.post(CONV, json={"context": {"asset_id": asset_id}})
    assert conv.status_code == 201, conv.text
    body = conv.json()
    assert body["context"]["type"] == "asset"
    assert body["context"]["id"] == asset_id
    assert body["context"]["label"] == "prod-ctx-01"
    assert body["context"]["available"] is True

    r = client.post(f"{CONV}/{body['id']}/messages", json={"content": "resume este activo"})
    assert r.status_code == 200
    assert "prod-ctx-01" in r.json()["assistant_message"]["content"]


def test_context_id_is_rejected_without_the_domain_permission(
    auth_client: TestClient, make_client
) -> None:
    asset_id = _asset(auth_client, "prod-secret-01")
    # A user with ai.use but no assets.read.
    from tests.integration.test_ai_rbac import _assign, _custom_role

    client = make_client("ai-ctx-noperm@example.com", roles=[])
    role_id = _custom_role(auth_client, "AIOnlyCtx", ["ai.use"])
    _assign(auth_client, "ai-ctx-noperm@example.com", [role_id])

    # Cannot even create the conversation with that context.
    r = client.post(CONV, json={"context": {"asset_id": asset_id}})
    assert r.status_code == 404


def test_unknown_context_id_is_404(make_client) -> None:
    client = make_client("ai-ctx-unknown@example.com", roles=["viewer"])
    r = client.post(
        CONV, json={"context": {"asset_id": "11111111-1111-1111-1111-111111111111"}}
    )
    assert r.status_code == 404


def test_trashed_context_becomes_unavailable(auth_client: TestClient, make_client) -> None:
    asset_id = _asset(auth_client, "prod-willtrash-01")
    client = make_client("ai-ctx-trash@example.com", roles=["viewer"])
    conv = client.post(CONV, json={"context": {"asset_id": asset_id}}).json()

    auth_client.delete(f"{API}/assets/{asset_id}")  # soft delete

    detail = client.get(f"{CONV}/{conv['id']}").json()
    assert detail["context"]["available"] is False
    r = client.post(f"{CONV}/{conv['id']}/messages", json={"content": "resume este activo"})
    assert r.status_code == 200
    assert "no está disponible" in r.json()["assistant_message"]["content"]


def test_context_rejects_both_asset_and_incident(make_client) -> None:
    client = make_client("ai-ctx-both@example.com", roles=["viewer"])
    r = client.post(
        CONV,
        json={
            "context": {
                "asset_id": "11111111-1111-1111-1111-111111111111",
                "incident_id": "22222222-2222-2222-2222-222222222222",
            }
        },
    )
    assert r.status_code == 422
