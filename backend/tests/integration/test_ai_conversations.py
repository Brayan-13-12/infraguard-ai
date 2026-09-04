"""AI Assistant - conversations API: ownership, CRUD, pagination, CSRF."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integration

API = "/api/v1"
CONV = f"{API}/ai/conversations"


def _make_conv(client: TestClient, title: str | None = None) -> dict:
    body = {} if title is None else {"title": title}
    r = client.post(CONV, json=body)
    assert r.status_code == 201, r.text
    return r.json()


def test_create_list_get_delete_own_conversation(make_client) -> None:
    client = make_client("ai-owner@example.com", roles=["viewer"])

    created = _make_conv(client, "Mi investigación")
    assert created["title"] == "Mi investigación"
    assert created["messages"] == []

    page = client.get(CONV).json()
    assert page["total"] == 1
    assert page["items"][0]["id"] == created["id"]
    assert page["items"][0]["message_count"] == 0

    got = client.get(f"{CONV}/{created['id']}")
    assert got.status_code == 200
    assert got.json()["id"] == created["id"]

    deleted = client.delete(f"{CONV}/{created['id']}")
    assert deleted.status_code == 200
    assert client.get(f"{CONV}/{created['id']}").status_code == 404
    assert client.get(CONV).json()["total"] == 0


def test_a_user_cannot_see_or_delete_another_users_conversation(make_client) -> None:
    alice = make_client("ai-alice@example.com", roles=["viewer"])
    bob = make_client("ai-bob@example.com", roles=["viewer"])

    conv = _make_conv(alice, "privado de alice")

    # Bob gets a 404 (not 403) - existence is not disclosed.
    assert bob.get(f"{CONV}/{conv['id']}").status_code == 404
    assert bob.delete(f"{CONV}/{conv['id']}").status_code == 404
    assert bob.post(f"{CONV}/{conv['id']}/messages", json={"content": "hola"}).status_code == 404

    # Bob's list never contains Alice's thread.
    assert all(i["id"] != conv["id"] for i in bob.get(CONV).json()["items"])
    # Alice still has it.
    assert alice.get(f"{CONV}/{conv['id']}").status_code == 200


def test_administrator_has_no_implicit_access_to_other_users_threads(
    auth_client: TestClient, make_client
) -> None:
    viewer = make_client("ai-private@example.com", roles=["viewer"])
    conv = _make_conv(viewer)
    # The admin client is a different user - strict ownership, no override.
    assert auth_client.get(f"{CONV}/{conv['id']}").status_code == 404


def test_conversations_are_ordered_by_recent_activity(make_client) -> None:
    client = make_client("ai-order@example.com", roles=["viewer"])
    a = _make_conv(client, "primera")
    b = _make_conv(client, "segunda")
    # Touch `a` with a message so it becomes the most recent.
    client.post(f"{CONV}/{a['id']}/messages", json={"content": "hola"})
    ids = [i["id"] for i in client.get(CONV).json()["items"]]
    assert ids == [a["id"], b["id"]]


def test_pagination(make_client) -> None:
    client = make_client("ai-page@example.com", roles=["viewer"])
    for i in range(5):
        _make_conv(client, f"c{i}")
    page1 = client.get(CONV, params={"page": 1, "page_size": 2}).json()
    assert page1["total"] == 5 and len(page1["items"]) == 2 and page1["total_pages"] == 3
    page3 = client.get(CONV, params={"page": 3, "page_size": 2}).json()
    assert len(page3["items"]) == 1


def test_create_and_delete_require_trusted_origin(make_client) -> None:
    client = make_client("ai-csrf@example.com", roles=["viewer"])
    conv = _make_conv(client)

    bad = client.post(CONV, json={}, headers={"Origin": "https://evil.example"})
    assert bad.status_code == 403
    bad_del = client.delete(
        f"{CONV}/{conv['id']}", headers={"Origin": "https://evil.example"}
    )
    assert bad_del.status_code == 403
    bad_msg = client.post(
        f"{CONV}/{conv['id']}/messages",
        json={"content": "x"},
        headers={"Origin": "https://evil.example"},
    )
    assert bad_msg.status_code == 403


def test_title_defaults_and_is_bounded(make_client) -> None:
    client = make_client("ai-title@example.com", roles=["viewer"])
    assert _make_conv(client)["title"] == "Nueva conversación"
    assert _make_conv(client, "   ")["title"] == "Nueva conversación"
    assert len(_make_conv(client, "x" * 120)["title"]) == 120
    # An over-long title is a client error, not silently truncated.
    assert client.post(CONV, json={"title": "x" * 500}).status_code == 422
