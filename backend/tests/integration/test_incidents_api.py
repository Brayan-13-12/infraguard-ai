"""Integration tests for the Incidents API against a real PostgreSQL."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integration

INCIDENTS = "/api/v1/incidents"
ASSETS = "/api/v1/assets"

BASE_INCIDENT = {
    "title": "Checkout latency spike",
    "severity": "High",
    "priority": "P2",
}
BASE_ASSET = {
    "name": "payments-db",
    "asset_type": "Database",
    "environment": "Production",
    "criticality": "Critical",
    "status": "Operational",
}


def _create_incident(client: TestClient, **overrides) -> dict:
    resp = client.post(INCIDENTS, json={**BASE_INCIDENT, **overrides})
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_asset(client: TestClient, **overrides) -> dict:
    resp = client.post(ASSETS, json={**BASE_ASSET, **overrides})
    assert resp.status_code == 201, resp.text
    return resp.json()


def _types(incident: dict) -> list[str]:
    return [e["type"] for e in incident["timeline"]]


# --- Create -------------------------------------------------------------


def test_create_returns_detail_with_timeline(auth_client: TestClient) -> None:
    body = _create_incident(auth_client, owner="sre-oncall")
    assert body["title"] == "Checkout latency spike"
    assert body["status"] == "Open"
    assert body["owner"] == "sre-oncall"
    assert body["resolved_at"] is None
    assert body["affected_assets"] == []
    assert _types(body) == ["CREATED"]
    assert body["timeline"][0]["message"] == "Incidente creado"
    assert body["timeline"][0]["actor_email"] == "asset-owner@example.com"


def test_create_with_affected_assets_links_and_logs(auth_client: TestClient) -> None:
    a1 = _create_asset(auth_client, name="payments-db")
    a2 = _create_asset(auth_client, name="web-prod-01", asset_type="Server")
    body = _create_incident(auth_client, asset_ids=[a1["id"], a2["id"]])

    assert {a["name"] for a in body["affected_assets"]} == {"payments-db", "web-prod-01"}
    assert _types(body) == ["CREATED", "ASSET_ADDED", "ASSET_ADDED"]
    added = [e["message"] for e in body["timeline"] if e["type"] == "ASSET_ADDED"]
    assert 'Activo "payments-db" añadido' in added


def test_create_rejects_unknown_asset(auth_client: TestClient) -> None:
    resp = auth_client.post(
        INCIDENTS,
        json={**BASE_INCIDENT, "asset_ids": ["11111111-1111-1111-1111-111111111111"]},
    )
    assert resp.status_code == 422


def test_create_rejects_invalid_enum(auth_client: TestClient) -> None:
    assert (
        auth_client.post(INCIDENTS, json={**BASE_INCIDENT, "severity": "Severe"}).status_code
        == 422
    )


def test_create_rejects_unknown_field(auth_client: TestClient) -> None:
    assert (
        auth_client.post(INCIDENTS, json={**BASE_INCIDENT, "root_cause": "dns"}).status_code
        == 422
    )


def test_create_from_foreign_origin_is_blocked(auth_client: TestClient) -> None:
    resp = auth_client.post(
        INCIDENTS, json=BASE_INCIDENT, headers={"Origin": "https://evil.example"}
    )
    assert resp.status_code == 403


def test_create_does_not_trust_created_by_from_body(auth_client: TestClient) -> None:
    resp = auth_client.post(
        INCIDENTS,
        json={**BASE_INCIDENT, "created_by": "11111111-1111-1111-1111-111111111111"},
    )
    assert resp.status_code == 422  # extra="forbid"


# --- Get / list -------------------------------------------------------


def test_get_missing_is_404(auth_client: TestClient) -> None:
    resp = auth_client.get(f"{INCIDENTS}/11111111-1111-1111-1111-111111111111")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Incident not found"


def test_list_row_shape_and_affected_count(auth_client: TestClient) -> None:
    a1 = _create_asset(auth_client, name="a1")
    _create_incident(auth_client, asset_ids=[a1["id"]])

    body = auth_client.get(INCIDENTS).json()
    assert body["total"] == 1
    row = body["items"][0]
    assert row["affected_asset_count"] == 1
    assert set(row) == {
        "id", "title", "severity", "status", "priority", "owner",
        "started_at", "detected_at", "resolved_at", "affected_asset_count",
        "created_at", "updated_at",
    }
    assert "description" not in row and "timeline" not in row


def test_list_is_paginated(auth_client: TestClient) -> None:
    for i in range(5):
        _create_incident(auth_client, title=f"incident-{i}")
    body = auth_client.get(INCIDENTS, params={"page": 1, "page_size": 2}).json()
    assert len(body["items"]) == 2
    assert body["total"] == 5
    assert body["total_pages"] == 3


def test_list_page_size_capped(auth_client: TestClient) -> None:
    assert auth_client.get(INCIDENTS, params={"page_size": 1000}).status_code == 422


def test_list_default_page_size_is_15(auth_client: TestClient) -> None:
    for i in range(17):
        _create_incident(auth_client, title=f"paging-{i:02d}")
    body = auth_client.get(INCIDENTS).json()  # no page_size -> server default
    assert body["page_size"] == 15
    assert len(body["items"]) == 15
    assert body["total"] == 17
    assert body["total_pages"] == 2


def test_search_matches_title_description_owner(auth_client: TestClient) -> None:
    _create_incident(auth_client, title="billing pipeline stalled")
    _create_incident(auth_client, title="unrelated", description="billing job backlog")
    _create_incident(auth_client, title="third", owner="billing-team")
    assert auth_client.get(INCIDENTS, params={"q": "billing"}).json()["total"] == 3


def test_search_treats_wildcards_literally(auth_client: TestClient) -> None:
    _create_incident(auth_client, title="plain")
    assert auth_client.get(INCIDENTS, params={"q": "%"}).json()["total"] == 0


@pytest.mark.parametrize(
    "param,value,other",
    [
        ("severity", "Low", {"severity": "Critical"}),
        ("status", "Monitoring", {"status": "Open"}),
        ("priority", "P4", {"priority": "P1"}),
    ],
)
def test_filter_by_catalog_field(auth_client: TestClient, param, value, other) -> None:
    _create_incident(auth_client, title="match", **{param: value})
    _create_incident(auth_client, title="nomatch", **other)
    body = auth_client.get(INCIDENTS, params={param: value}).json()
    assert body["total"] == 1 and body["items"][0]["title"] == "match"


def test_filter_by_multiple_statuses(auth_client: TestClient) -> None:
    _create_incident(auth_client, title="a", status="Investigating")
    _create_incident(auth_client, title="b", status="Monitoring")
    _create_incident(auth_client, title="c", status="Open")
    body = auth_client.get(
        f"{INCIDENTS}?status=Investigating&status=Monitoring"
    ).json()
    assert {x["title"] for x in body["items"]} == {"a", "b"}


def test_filter_by_affected_asset(auth_client: TestClient) -> None:
    a1 = _create_asset(auth_client, name="a1")
    a2 = _create_asset(auth_client, name="a2")
    i1 = _create_incident(auth_client, title="hits", asset_ids=[a1["id"]])
    _create_incident(auth_client, title="misses", asset_ids=[a2["id"]])
    body = auth_client.get(INCIDENTS, params={"asset_id": a1["id"]}).json()
    assert body["total"] == 1 and body["items"][0]["id"] == i1["id"]


def test_filter_rejects_invalid_enum(auth_client: TestClient) -> None:
    assert auth_client.get(INCIDENTS, params={"severity": "Nope"}).status_code == 422


def test_sort_by_severity_puts_critical_first(auth_client: TestClient) -> None:
    _create_incident(auth_client, title="low", severity="Low")
    _create_incident(auth_client, title="crit", severity="Critical")
    _create_incident(auth_client, title="med", severity="Medium")
    body = auth_client.get(INCIDENTS, params={"sort": "severity"}).json()
    assert [x["title"] for x in body["items"]] == ["crit", "med", "low"]


# --- Update / lifecycle events -----------------------------------------


def test_patch_status_logs_status_changed(auth_client: TestClient) -> None:
    inc = _create_incident(auth_client)
    resp = auth_client.patch(f"{INCIDENTS}/{inc['id']}", json={"status": "Investigating"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "Investigating"
    assert "STATUS_CHANGED" in _types(body)
    msg = [e["message"] for e in body["timeline"] if e["type"] == "STATUS_CHANGED"][0]
    assert msg == "Estado cambió de Abierto a Investigando"


def test_patch_severity_and_priority_log_events(auth_client: TestClient) -> None:
    inc = _create_incident(auth_client)
    body = auth_client.patch(
        f"{INCIDENTS}/{inc['id']}", json={"severity": "Critical", "priority": "P1"}
    ).json()
    assert "SEVERITY_CHANGED" in _types(body)
    assert "PRIORITY_CHANGED" in _types(body)


def test_patch_owner_logs_owner_changed(auth_client: TestClient) -> None:
    inc = _create_incident(auth_client)
    body = auth_client.patch(f"{INCIDENTS}/{inc['id']}", json={"owner": "sre-oncall"}).json()
    assert "OWNER_CHANGED" in _types(body)


def test_patch_no_op_status_does_not_log(auth_client: TestClient) -> None:
    inc = _create_incident(auth_client)
    body = auth_client.patch(f"{INCIDENTS}/{inc['id']}", json={"status": "Open"}).json()
    assert _types(body) == ["CREATED"]


def test_patch_asset_ids_diffs_the_set(auth_client: TestClient) -> None:
    a1 = _create_asset(auth_client, name="a1")
    a2 = _create_asset(auth_client, name="a2")
    inc = _create_incident(auth_client, asset_ids=[a1["id"]])

    body = auth_client.patch(
        f"{INCIDENTS}/{inc['id']}", json={"asset_ids": [a2["id"]]}
    ).json()
    assert {a["name"] for a in body["affected_assets"]} == {"a2"}
    assert "ASSET_ADDED" in _types(body) and "ASSET_REMOVED" in _types(body)

    cleared = auth_client.patch(
        f"{INCIDENTS}/{inc['id']}", json={"asset_ids": []}
    ).json()
    assert cleared["affected_assets"] == []


def test_patch_rejects_unknown_asset(auth_client: TestClient) -> None:
    inc = _create_incident(auth_client)
    resp = auth_client.patch(
        f"{INCIDENTS}/{inc['id']}",
        json={"asset_ids": ["11111111-1111-1111-1111-111111111111"]},
    )
    assert resp.status_code == 422


def test_patch_rejects_unknown_field(auth_client: TestClient) -> None:
    inc = _create_incident(auth_client)
    assert (
        auth_client.patch(
            f"{INCIDENTS}/{inc['id']}", json={"resolved_at": "2026-09-01T00:00:00Z"}
        ).status_code
        == 422
    )


def test_patch_missing_is_404(auth_client: TestClient) -> None:
    resp = auth_client.patch(
        f"{INCIDENTS}/11111111-1111-1111-1111-111111111111", json={"status": "Closed"}
    )
    assert resp.status_code == 404


# --- Resolve / reopen -------------------------------------------------


def test_resolve_sets_resolved_at_and_logs(auth_client: TestClient) -> None:
    inc = _create_incident(auth_client)
    body = auth_client.post(f"{INCIDENTS}/{inc['id']}/resolve").json()
    assert body["status"] == "Resolved"
    assert body["resolved_at"] is not None
    assert "RESOLVED" in _types(body)


def test_resolve_is_idempotent(auth_client: TestClient) -> None:
    inc = _create_incident(auth_client)
    first = auth_client.post(f"{INCIDENTS}/{inc['id']}/resolve").json()
    second = auth_client.post(f"{INCIDENTS}/{inc['id']}/resolve").json()
    assert first["resolved_at"] == second["resolved_at"]
    assert _types(second).count("RESOLVED") == 1


def test_reopen_clears_resolved_at_and_logs(auth_client: TestClient) -> None:
    inc = _create_incident(auth_client)
    auth_client.post(f"{INCIDENTS}/{inc['id']}/resolve")
    body = auth_client.post(f"{INCIDENTS}/{inc['id']}/reopen").json()
    assert body["status"] == "Open"
    assert body["resolved_at"] is None
    assert "REOPENED" in _types(body)


def test_reopen_active_incident_is_noop(auth_client: TestClient) -> None:
    inc = _create_incident(auth_client)
    body = auth_client.post(f"{INCIDENTS}/{inc['id']}/reopen").json()
    assert body["status"] == "Open"
    assert _types(body) == ["CREATED"]


def test_patch_to_resolved_then_back_reconciles_resolved_at(auth_client: TestClient) -> None:
    inc = _create_incident(auth_client)
    resolved = auth_client.patch(
        f"{INCIDENTS}/{inc['id']}", json={"status": "Resolved"}
    ).json()
    assert resolved["resolved_at"] is not None
    assert "RESOLVED" in _types(resolved)

    reopened = auth_client.patch(
        f"{INCIDENTS}/{inc['id']}", json={"status": "Investigating"}
    ).json()
    assert reopened["resolved_at"] is None
    assert "REOPENED" in _types(reopened)


# --- Comments -------------------------------------------------------


def test_add_comment_appends_timeline_entry(auth_client: TestClient) -> None:
    inc = _create_incident(auth_client)
    resp = auth_client.post(
        f"{INCIDENTS}/{inc['id']}/comments", json={"message": "rolled back deploy"}
    )
    assert resp.status_code == 201
    assert resp.json()["type"] == "COMMENT"

    detail = auth_client.get(f"{INCIDENTS}/{inc['id']}").json()
    assert detail["timeline"][-1]["message"] == "rolled back deploy"


def test_blank_comment_rejected(auth_client: TestClient) -> None:
    inc = _create_incident(auth_client)
    assert (
        auth_client.post(
            f"{INCIDENTS}/{inc['id']}/comments", json={"message": "   "}
        ).status_code
        == 422
    )


# --- Summary -------------------------------------------------------


def test_summary_aggregates(auth_client: TestClient) -> None:
    _create_incident(auth_client, title="c1", severity="Critical", status="Open")
    _create_incident(auth_client, title="i1", status="Investigating")
    m1 = _create_incident(auth_client, title="m1", status="Monitoring")
    r1 = _create_incident(auth_client, title="r1")
    auth_client.post(f"{INCIDENTS}/{r1['id']}/resolve")

    body = auth_client.get(f"{INCIDENTS}/summary").json()
    assert set(body) == {
        "total", "open", "critical_open", "investigating",
        "monitoring", "resolved_recently", "by_severity", "by_status",
    }
    assert body["total"] == 4
    assert body["open"] == 3
    assert body["critical_open"] == 1
    assert body["investigating"] == 1
    assert body["monitoring"] == 1
    assert body["resolved_recently"] == 1
    assert set(body["by_severity"]) == {"Critical", "High", "Medium", "Low"}
    assert set(body["by_status"]) == {
        "Open", "Investigating", "Identified", "Monitoring", "Resolved", "Closed",
    }
    assert m1["id"]


def test_summary_requires_auth(client: TestClient) -> None:
    assert client.get(f"{INCIDENTS}/summary").status_code == 401


def test_summary_when_database_errors_is_generic_503(
    auth_client: TestClient, monkeypatch
) -> None:
    from sqlalchemy.exc import OperationalError

    def _boom(*_a, **_k):
        raise OperationalError("SELECT", {}, Exception("connection refused"))

    monkeypatch.setattr(
        "app.api.v1.routes.incidents.get_incident_summary", _boom
    )
    resp = auth_client.get(f"{INCIDENTS}/summary")
    assert resp.status_code == 503
    lowered = resp.text.lower()
    for marker in ("psycopg", "traceback", "operationalerror", "connection refused"):
        assert marker not in lowered


# --- Auth -------------------------------------------------------


def test_unauthenticated_list_is_401(client: TestClient) -> None:
    assert client.get(INCIDENTS).status_code == 401


def test_unauthenticated_create_is_401(client: TestClient) -> None:
    assert client.post(INCIDENTS, json=BASE_INCIDENT).status_code == 401
