"""Integration tests for Trash / Restore (Governance & Administration - Phase 2).

Covers the guarantees from the spec:

* DELETE is a **soft delete** - the row survives, `deleted_at` / `deleted_by`
  stamped, and it disappears from every normal query / summary / picker;
* a trashed record is only reachable through the dedicated `/trash` API;
* restore is lossless (same id, timeline, relationships) and reverses everything;
* DELETE / RESTORE each emit exactly one audit event;
* a failed delete/restore leaves no false "successful" audit event;
* deleting an asset never corrupts incident history, and vice-versa;
* every endpoint requires authentication; there is no permanent purge.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integration

ASSETS = "/api/v1/assets"
INCIDENTS = "/api/v1/incidents"
TRASH = "/api/v1/trash"
AUDIT = "/api/v1/audit"

BASE_ASSET = {
    "name": "payments-db",
    "asset_type": "Database",
    "environment": "Production",
    "criticality": "Critical",
    "status": "Operational",
}
BASE_INCIDENT = {"title": "Checkout latency spike", "severity": "High", "priority": "P2"}


def _create_asset(client: TestClient, **overrides) -> dict:
    resp = client.post(ASSETS, json={**BASE_ASSET, **overrides})
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_incident(client: TestClient, **overrides) -> dict:
    resp = client.post(INCIDENTS, json={**BASE_INCIDENT, **overrides})
    assert resp.status_code == 201, resp.text
    return resp.json()


def _audit_actions(client: TestClient, entity_id: str) -> list[str]:
    resp = client.get(AUDIT, params={"entity_id": entity_id, "page_size": 100})
    assert resp.status_code == 200, resp.text
    return [e["action"] for e in resp.json()["items"]]


# --- Asset soft delete -------------------------------------------------


def test_delete_asset_soft_deletes_and_audits(auth_client: TestClient) -> None:
    asset = _create_asset(auth_client, name="trash-me-db")

    resp = auth_client.delete(f"{ASSETS}/{asset['id']}")
    assert resp.status_code == 200
    assert "Trash" in resp.json()["detail"]

    # gone from the normal API...
    assert auth_client.get(f"{ASSETS}/{asset['id']}").status_code == 410
    assert auth_client.get(ASSETS, params={"q": "trash-me-db"}).json()["total"] == 0

    # ...but present in Trash, with who + when
    tr = auth_client.get(f"{TRASH}/assets/{asset['id']}")
    assert tr.status_code == 200
    body = tr.json()
    assert body["id"] == asset["id"]
    assert body["deleted_at"] is not None
    assert body["deleted_by_email"] == "asset-owner@example.com"

    assert "DELETE" in _audit_actions(auth_client, asset["id"])


def test_delete_and_restore_audit_events_carry_who_what_when(
    auth_client: TestClient,
) -> None:
    asset = _create_asset(auth_client, name="audited-trash-db")
    auth_client.delete(f"{ASSETS}/{asset['id']}")
    auth_client.post(f"{TRASH}/assets/{asset['id']}/restore")

    events = auth_client.get(
        AUDIT, params={"entity_id": asset["id"], "page_size": 100}
    ).json()["items"]
    by_action = {e["action"]: e for e in events}

    for action in ("DELETE", "RESTORE"):
        ev = by_action[action]
        assert ev["entity_type"] == "Asset"
        assert ev["entity_label"] == "audited-trash-db"
        assert ev["actor_email"] == "asset-owner@example.com"
        assert ev["occurred_at"] is not None


def test_delete_missing_asset_is_404(auth_client: TestClient) -> None:
    assert (
        auth_client.delete(f"{ASSETS}/11111111-1111-1111-1111-111111111111").status_code
        == 404
    )


def test_delete_already_trashed_asset_is_409(auth_client: TestClient) -> None:
    asset = _create_asset(auth_client, name="double-delete")
    assert auth_client.delete(f"{ASSETS}/{asset['id']}").status_code == 200
    assert auth_client.delete(f"{ASSETS}/{asset['id']}").status_code == 409


def test_trashed_asset_excluded_from_summary(auth_client: TestClient) -> None:
    a1 = _create_asset(auth_client, name="keep-db")
    a2 = _create_asset(auth_client, name="drop-db")
    before = auth_client.get(f"{ASSETS}/summary").json()

    auth_client.delete(f"{ASSETS}/{a2['id']}")
    after = auth_client.get(f"{ASSETS}/summary").json()

    assert after["total"] == before["total"] - 1
    # a1 still counted, a2 not
    assert after["by_criticality"]["Critical"] == before["by_criticality"]["Critical"] - 1
    del a1


def test_patch_trashed_asset_is_410(auth_client: TestClient) -> None:
    asset = _create_asset(auth_client, name="no-edit-in-trash")
    auth_client.delete(f"{ASSETS}/{asset['id']}")
    assert (
        auth_client.patch(f"{ASSETS}/{asset['id']}", json={"status": "Degraded"}).status_code
        == 410
    )


# --- Asset restore --------------------------------------------------


def test_restore_asset_reverses_everything(auth_client: TestClient) -> None:
    asset = _create_asset(auth_client, name="round-trip-db")
    auth_client.delete(f"{ASSETS}/{asset['id']}")

    resp = auth_client.post(f"{TRASH}/assets/{asset['id']}/restore")
    assert resp.status_code == 200

    # back in the normal API, same id, deleted marks cleared
    got = auth_client.get(f"{ASSETS}/{asset['id']}")
    assert got.status_code == 200
    assert got.json()["id"] == asset["id"]

    # gone from Trash
    assert auth_client.get(f"{TRASH}/assets/{asset['id']}").status_code == 404
    assert auth_client.get(f"{TRASH}/assets").json()["total"] == 0

    actions = _audit_actions(auth_client, asset["id"])
    assert actions.count("DELETE") == 1
    assert actions.count("RESTORE") == 1


def test_restore_asset_not_in_trash_is_404(auth_client: TestClient) -> None:
    asset = _create_asset(auth_client, name="never-deleted")
    assert auth_client.post(f"{TRASH}/assets/{asset['id']}/restore").status_code == 404


# --- Incident soft delete + relationship / timeline preservation ------


def test_delete_incident_preserves_timeline_and_relationships(auth_client: TestClient) -> None:
    a1 = _create_asset(auth_client, name="inc-asset-1")
    incident = _create_incident(auth_client, title="trash-inc", asset_ids=[a1["id"]])
    # add some history
    auth_client.patch(f"{INCIDENTS}/{incident['id']}", json={"status": "Investigating"})

    live = auth_client.get(f"{INCIDENTS}/{incident['id']}").json()
    timeline_len = len(live["timeline"])
    assert timeline_len >= 3  # CREATED + ASSET_ADDED + STATUS_CHANGED

    assert auth_client.delete(f"{INCIDENTS}/{incident['id']}").status_code == 200
    assert auth_client.get(f"{INCIDENTS}/{incident['id']}").status_code == 410
    assert auth_client.get(INCIDENTS, params={"q": "trash-inc"}).json()["total"] == 0

    trashed = auth_client.get(f"{TRASH}/incidents/{incident['id']}")
    assert trashed.status_code == 200
    body = trashed.json()
    assert len(body["timeline"]) == timeline_len  # untouched
    assert [asset["id"] for asset in body["affected_assets"]] == [a1["id"]]
    assert body["deleted_by_email"] == "asset-owner@example.com"

    # the asset itself is NOT touched by deleting the incident
    assert auth_client.get(f"{ASSETS}/{a1['id']}").status_code == 200

    assert "DELETE" in _audit_actions(auth_client, incident["id"])


def test_restore_incident_is_lossless(auth_client: TestClient) -> None:
    a1 = _create_asset(auth_client, name="restore-inc-asset")
    incident = _create_incident(auth_client, title="restore-inc", asset_ids=[a1["id"]])
    before = auth_client.get(f"{INCIDENTS}/{incident['id']}").json()

    auth_client.delete(f"{INCIDENTS}/{incident['id']}")
    assert auth_client.post(f"{TRASH}/incidents/{incident['id']}/restore").status_code == 200

    after = auth_client.get(f"{INCIDENTS}/{incident['id']}")
    assert after.status_code == 200
    after = after.json()
    assert after["id"] == before["id"]
    assert after["created_at"] == before["created_at"]
    assert len(after["timeline"]) == len(before["timeline"])
    assert [a["id"] for a in after["affected_assets"]] == [a1["id"]]

    assert auth_client.get(f"{TRASH}/incidents").json()["total"] == 0


def test_trashed_incident_excluded_from_summary(auth_client: TestClient) -> None:
    _create_incident(auth_client, title="summary-keep")
    drop = _create_incident(auth_client, title="summary-drop")
    before = auth_client.get(f"{INCIDENTS}/summary").json()
    auth_client.delete(f"{INCIDENTS}/{drop['id']}")
    after = auth_client.get(f"{INCIDENTS}/summary").json()
    assert after["total"] == before["total"] - 1
    assert after["open"] == before["open"] - 1


# --- Deleting an asset that an incident references (relationship survives) ---


def test_deleting_a_linked_asset_keeps_incident_history(auth_client: TestClient) -> None:
    asset = _create_asset(auth_client, name="doomed-db")
    incident = _create_incident(
        auth_client, title="depends-on-doomed", asset_ids=[asset["id"]]
    )

    assert auth_client.delete(f"{ASSETS}/{asset['id']}").status_code == 200

    # the incident detail still renders, and still shows the (now trashed) asset
    detail = auth_client.get(f"{INCIDENTS}/{incident['id']}")
    assert detail.status_code == 200
    affected = detail.json()["affected_assets"]
    assert len(affected) == 1
    assert affected[0]["id"] == asset["id"]
    assert affected[0]["deleted_at"] is not None  # badged "En papelera" by the UI

    # restoring the asset makes the relationship fully active again
    auth_client.post(f"{TRASH}/assets/{asset['id']}/restore")
    affected = auth_client.get(f"{INCIDENTS}/{incident['id']}").json()["affected_assets"]
    assert affected[0]["deleted_at"] is None


def test_trashed_asset_not_offered_by_incident_picker(auth_client: TestClient) -> None:
    asset = _create_asset(auth_client, name="picker-hidden")
    auth_client.delete(f"{ASSETS}/{asset['id']}")

    # creating an incident that links the trashed asset -> 422
    resp = auth_client.post(
        INCIDENTS, json={**BASE_INCIDENT, "asset_ids": [asset["id"]]}
    )
    assert resp.status_code == 422


# --- Trash list: filters / search / pagination -----------------------


def test_trash_assets_list_filters_and_paginates(auth_client: TestClient) -> None:
    for i in range(3):
        a = _create_asset(auth_client, name=f"batch-db-{i}", asset_type="Database")
        auth_client.delete(f"{ASSETS}/{a['id']}")
    srv = _create_asset(auth_client, name="batch-server", asset_type="Server")
    auth_client.delete(f"{ASSETS}/{srv['id']}")

    page1 = auth_client.get(f"{TRASH}/assets", params={"page_size": 2}).json()
    assert page1["page_size"] == 2
    assert len(page1["items"]) == 2
    assert page1["total"] == 4
    assert page1["total_pages"] == 2
    # most recently deleted first
    times = [i["deleted_at"] for i in page1["items"]]
    assert times == sorted(times, reverse=True)

    by_type = auth_client.get(f"{TRASH}/assets", params={"type": "Database"}).json()
    assert by_type["total"] == 3

    by_search = auth_client.get(f"{TRASH}/assets", params={"q": "batch-db-1"}).json()
    assert by_search["total"] == 1

    by_deleter = auth_client.get(
        f"{TRASH}/assets", params={"deleted_by": "asset-owner"}
    ).json()
    assert by_deleter["total"] == 4
    none = auth_client.get(f"{TRASH}/assets", params={"deleted_by": "nobody@x.io"}).json()
    assert none["total"] == 0


def test_trash_summary_counts(auth_client: TestClient) -> None:
    a = _create_asset(auth_client, name="sum-a")
    inc = _create_incident(auth_client, title="sum-i")
    auth_client.delete(f"{ASSETS}/{a['id']}")
    auth_client.delete(f"{INCIDENTS}/{inc['id']}")

    summary = auth_client.get(f"{TRASH}/summary").json()
    assert summary == {"assets": 1, "incidents": 1}


# --- Auth ----------------------------------------------------------


def test_trash_requires_authentication(client: TestClient) -> None:
    assert client.get(f"{TRASH}/assets").status_code == 401
    assert client.get(f"{TRASH}/incidents").status_code == 401
    assert client.get(f"{TRASH}/summary").status_code == 401
    assert (
        client.post(
            f"{TRASH}/assets/11111111-1111-1111-1111-111111111111/restore"
        ).status_code
        == 401
    )


def test_delete_requires_authentication(client: TestClient) -> None:
    assert (
        client.delete(f"{ASSETS}/11111111-1111-1111-1111-111111111111").status_code == 401
    )
    assert (
        client.delete(f"{INCIDENTS}/11111111-1111-1111-1111-111111111111").status_code
        == 401
    )


def test_there_is_no_permanent_purge_endpoint(auth_client: TestClient) -> None:
    """No `DELETE /trash/...` in this milestone - permanent destruction waits for
    RBAC."""
    asset = _create_asset(auth_client, name="cannot-purge")
    auth_client.delete(f"{ASSETS}/{asset['id']}")
    resp = auth_client.request("DELETE", f"{TRASH}/assets/{asset['id']}")
    assert resp.status_code in (404, 405)


# --- Transaction integrity --------------------------------------


def test_failed_restore_leaves_no_false_audit_event(db_session) -> None:
    """`record_event` only flushes; if the surrounding transaction is rolled back
    (request error) the RESTORE audit row must vanish with it."""
    from sqlalchemy import func, select

    from app.models.audit import AuditEvent
    from app.services.audit import AuditContext, record_event

    ctx = AuditContext(actor_user_id=None, actor_email="rollback@example.com")
    record_event(
        db_session,
        ctx=ctx,
        action="RESTORE",
        entity_type="Asset",
        entity_id="rollback-asset",
        entity_label="rollback-asset",
    )
    assert db_session.execute(
        select(func.count())
        .select_from(AuditEvent)
        .where(AuditEvent.entity_id == "rollback-asset")
    ).scalar_one() == 1

    db_session.rollback()

    assert db_session.execute(
        select(func.count())
        .select_from(AuditEvent)
        .where(AuditEvent.entity_id == "rollback-asset")
    ).scalar_one() == 0
