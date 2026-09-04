"""AI Assistant - RBAC: ``ai.use`` gate + per-tool domain permissions.

The assistant is never a permission bypass: if a role cannot read Audit
directly, it cannot obtain Audit data by asking the AI.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integration

API = "/api/v1"
CONV = f"{API}/ai/conversations"
ADMIN_ROLES = f"{API}/admin/roles"
ADMIN_USERS = f"{API}/admin/users"


def _custom_role(admin: TestClient, name: str, perms: list[str]) -> str:
    return admin.post(ADMIN_ROLES, json={"name": name, "permissions": perms}).json()["id"]


def _assign(admin: TestClient, email: str, role_ids: list[str]) -> None:
    uid = admin.get(ADMIN_USERS, params={"q": email}).json()["items"][0]["id"]
    assert admin.put(f"{ADMIN_USERS}/{uid}/roles", json={"role_ids": role_ids}).status_code == 200


def _seed(admin: TestClient) -> None:
    assert admin.post(
        f"{API}/assets",
        json={
            "name": "prod-db-01",
            "asset_type": "Database",
            "environment": "Production",
            "criticality": "Critical",
            "status": "Operational",
        },
    ).status_code == 201


def _chat(client: TestClient, content: str) -> dict:
    conv = client.post(CONV, json={}).json()
    r = client.post(f"{CONV}/{conv['id']}/messages", json={"content": content})
    assert r.status_code == 200, r.text
    return r.json()["assistant_message"]


def test_user_without_ai_use_is_denied_everywhere(auth_client: TestClient, make_client) -> None:
    client = make_client("ai-none@example.com", roles=[])  # zero permissions

    assert client.get(f"{API}/ai/capabilities").status_code == 403
    assert client.get(CONV).status_code == 403
    assert client.post(CONV, json={}).status_code == 403

    # even a viewer-with-assets is fine; but a role explicitly missing ai.use is not
    role_id = _custom_role(auth_client, "AssetsOnlyNoAI", ["assets.read"])
    _assign(auth_client, "ai-none@example.com", [role_id])
    assert client.get(CONV).status_code == 403


def test_ai_use_plus_assets_read_can_query_assets(make_client) -> None:
    client = make_client("ai-viewer@example.com", roles=["viewer"])  # ai.use + assets.read
    msg = _chat(client, "¿cuántos activos críticos hay?")
    assert "permiso" not in msg["content"].lower()


def test_ai_use_without_assets_read_cannot_get_asset_data(
    auth_client: TestClient, make_client
) -> None:
    _seed(auth_client)
    client = make_client("ai-onlyuse@example.com", roles=[])
    role_id = _custom_role(auth_client, "AIOnly", ["ai.use"])
    _assign(auth_client, "ai-onlyuse@example.com", [role_id])

    msg = _chat(client, "muéstrame los activos críticos de producción")
    # No asset data is leaked; the assistant says it lacks the permission.
    assert "permiso" in msg["content"].lower()
    assert "prod-db-01" not in msg["content"]
    assert not any(e["source"] == "assets" for e in msg["evidence"])


def test_viewer_cannot_reach_audit_data_through_ai(auth_client: TestClient, make_client) -> None:
    # Admin makes a real audited change first.
    r = auth_client.post(
        f"{API}/assets",
        json={
            "name": "ci-audited-asset",
            "asset_type": "Server",
            "environment": "Test",
            "criticality": "Low",
            "status": "Operational",
        },
    )
    asset_id = r.json()["id"]
    auth_client.patch(f"{API}/assets/{asset_id}", json={"status": "Degraded"})

    # Viewer: ai.use + assets.read + incidents.read, NO audit.read.
    viewer = make_client("ai-viewer2@example.com", roles=["viewer"])
    assert viewer.get(f"{API}/audit").status_code == 403  # baseline: no direct access

    msg = _chat(viewer, "¿qué cambios recientes se hicieron en Auditoría?")
    assert "permiso" in msg["content"].lower()
    assert "ci-audited-asset" not in msg["content"]
    assert not any(e["source"] == "audit" for e in msg["evidence"])

    # An analyst (has audit.read) CAN.
    analyst = make_client("ai-analyst@example.com", roles=["analyst"])
    ok = _chat(analyst, "¿qué cambios recientes hay en Auditoría?")
    assert "permiso" not in ok["content"].lower()
    assert any(e["source"] == "audit" for e in ok["evidence"])


def test_capabilities_reflect_the_callers_permissions(make_client) -> None:
    viewer = make_client("ai-cap-v@example.com", roles=["viewer"])
    caps = viewer.get(f"{API}/ai/capabilities").json()
    assert caps["read_only"] is True
    by_name = {t["name"]: t for t in caps["tools"]}
    assert by_name["search_assets"]["available"] is True
    assert by_name["search_audit"]["available"] is False

    analyst = make_client("ai-cap-a@example.com", roles=["analyst"])
    caps_a = analyst.get(f"{API}/ai/capabilities").json()
    by_name_a = {t["name"]: t for t in caps_a["tools"]}
    assert by_name_a["search_audit"]["available"] is True


def test_no_mutating_tool_is_registered() -> None:
    from app.services.ai.tools import REGISTRY

    for tool in REGISTRY.values():
        assert tool.permission.endswith(".read"), tool.name
        assert "." in tool.permission
