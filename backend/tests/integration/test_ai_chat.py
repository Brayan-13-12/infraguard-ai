"""AI Assistant - the message flow: grounded answers, persistence, evidence."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integration

API = "/api/v1"
CONV = f"{API}/ai/conversations"


def _seed_assets(admin: TestClient) -> None:
    for name, crit, env in [
        ("prod-api-01", "Critical", "Production"),
        ("prod-api-02", "Critical", "Production"),
        ("prod-web-01", "High", "Production"),
        ("dev-box-01", "Low", "Development"),
    ]:
        assert admin.post(
            f"{API}/assets",
            json={
                "name": name,
                "asset_type": "Application",
                "environment": env,
                "criticality": crit,
                "status": "Operational",
            },
        ).status_code == 201


def _chat(client: TestClient, conv_id: str, content: str) -> dict:
    r = client.post(f"{CONV}/{conv_id}/messages", json={"content": content})
    assert r.status_code == 200, r.text
    return r.json()


def test_grounded_answer_uses_real_records_and_evidence(
    auth_client: TestClient, make_client
) -> None:
    _seed_assets(auth_client)
    client = make_client("ai-chat@example.com", roles=["analyst"])
    conv = client.post(CONV, json={}).json()

    reply = _chat(client, conv["id"], "¿Cuántos activos críticos tenemos en producción?")
    text = reply["assistant_message"]["content"]
    assert "2" in text
    assert "prod-api-01" in text or "prod-api-02" in text
    ev = reply["assistant_message"]["evidence"]
    assert any(e["source"] == "assets" for e in ev)
    ents = reply["assistant_message"]["entities"]
    assert any(e["type"] == "asset" for e in ents)
    assert reply["assistant_message"]["suggestions"]


def test_user_and_assistant_messages_are_persisted_and_conversation_touched(
    auth_client: TestClient, make_client
) -> None:
    _seed_assets(auth_client)
    client = make_client("ai-persist@example.com", roles=["viewer"])
    conv = client.post(CONV, json={}).json()
    created_updated = client.get(CONV).json()["items"][0]["updated_at"]

    _chat(client, conv["id"], "Resume el inventario de activos")

    detail = client.get(f"{CONV}/{conv['id']}").json()
    assert [m["role"] for m in detail["messages"]] == ["user", "assistant"]
    assert detail["messages"][0]["content"] == "Resume el inventario de activos"
    assert client.get(CONV).json()["items"][0]["updated_at"] >= created_updated
    assert client.get(CONV).json()["items"][0]["message_count"] == 2


def test_first_message_derives_a_deterministic_title(make_client) -> None:
    client = make_client("ai-title2@example.com", roles=["viewer"])
    conv = client.post(CONV, json={}).json()
    assert conv["title"] == "Nueva conversación"
    reply = _chat(client, conv["id"], "muéstrame los activos críticos de producción")
    assert reply["title"] == "Muéstrame los activos críticos de producción"
    # A manual title is not overwritten.
    conv2 = client.post(CONV, json={"title": "Mi título"}).json()
    r2 = _chat(client, conv2["id"], "hola")
    assert r2["title"] == "Mi título"


def test_unsupported_query_is_honest_not_hallucinated(make_client) -> None:
    client = make_client("ai-unsup@example.com", roles=["viewer"])
    conv = client.post(CONV, json={}).json()
    reply = _chat(client, conv["id"], "¿cuál es la capital de Francia?")
    text = reply["assistant_message"]["content"].lower()
    assert "proveedor de ia" in text
    assert reply["assistant_message"]["entities"] == []


def test_missing_entity_is_reported_not_invented(make_client) -> None:
    client = make_client("ai-missing@example.com", roles=["viewer"])
    conv = client.post(CONV, json={}).json()
    reply = _chat(client, conv["id"], 'busca el activo "no-existe-jamas-9000"')
    assert "no encontr" in reply["assistant_message"]["content"].lower()


def test_message_length_bounds(make_client) -> None:
    client = make_client("ai-len@example.com", roles=["viewer"])
    conv = client.post(CONV, json={}).json()
    assert client.post(f"{CONV}/{conv['id']}/messages", json={"content": ""}).status_code == 422
    assert client.post(
        f"{CONV}/{conv['id']}/messages", json={"content": "   "}
    ).status_code == 422
    big = client.post(f"{CONV}/{conv['id']}/messages", json={"content": "a" * 5000})
    assert big.status_code == 422


def test_history_continuity(make_client, auth_client: TestClient) -> None:
    _seed_assets(auth_client)
    client = make_client("ai-hist@example.com", roles=["analyst"])
    conv = client.post(CONV, json={}).json()
    _chat(client, conv["id"], "¿Cuántos activos críticos hay?")
    _chat(client, conv["id"], "¿y cuántos incidentes abiertos?")
    detail = client.get(f"{CONV}/{conv['id']}").json()
    assert len(detail["messages"]) == 4


def test_no_secret_material_in_responses(auth_client: TestClient, make_client) -> None:
    _seed_assets(auth_client)
    client = make_client("ai-secret@example.com", roles=["analyst"])
    conv = client.post(CONV, json={}).json()
    r = client.post(f"{CONV}/{conv['id']}/messages", json={"content": "resume la infraestructura"})
    low = r.text.lower()
    for marker in ("password", "passphrase", "hash", "authorization", "bearer ", "jwt", "secret"):
        assert marker not in low
