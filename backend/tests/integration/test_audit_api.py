"""Integration tests for the Audit Log against a real PostgreSQL.

Covers the guarantees from the Audit spec:

* every governance-relevant action writes exactly one meaningful audit event
  (Asset / Incident CREATE / UPDATE / STATUS_CHANGED / RELATION_CHANGED /
  RESOLVED / REOPENED, LOGIN, LOGOUT);
* field diffs record *from* value *to* value, only for fields that changed;
* idempotent no-ops write nothing;
* a sensitive value (password / JWT / cookie) is never persisted anywhere;
* a failed request leaves **no** audit event behind (atomic with the mutation);
* list pagination / search / filters / detail;
* a database error is a generic 503 (no internals leak).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integration

AUDIT = "/api/v1/audit"
ASSETS = "/api/v1/assets"
INCIDENTS = "/api/v1/incidents"

CREDS = {"email": "asset-owner@example.com", "password": "a-perfectly-fine-passphrase"}

BASE_ASSET = {
    "name": "payments-db",
    "asset_type": "Database",
    "environment": "Production",
    "criticality": "Critical",
    "status": "Operational",
}
BASE_INCIDENT = {"title": "Checkout latency spike", "severity": "High", "priority": "P2"}


# --- helpers ---------------------------------------------------------------


def _events(client: TestClient, **params) -> list[dict]:
    resp = client.get(AUDIT, params=params)
    assert resp.status_code == 200, resp.text
    return resp.json()["items"]


def _detail(client: TestClient, event_id: str) -> dict:
    resp = client.get(f"{AUDIT}/{event_id}")
    assert resp.status_code == 200, resp.text
    return resp.json()


def _create_asset(client: TestClient, **overrides) -> dict:
    resp = client.post(ASSETS, json={**BASE_ASSET, **overrides})
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_incident(client: TestClient, **overrides) -> dict:
    resp = client.post(INCIDENTS, json={**BASE_INCIDENT, **overrides})
    assert resp.status_code == 201, resp.text
    return resp.json()


def _changes_by_field(detail: dict) -> dict[str, tuple[str | None, str | None]]:
    return {c["field_name"]: (c["old_value"], c["new_value"]) for c in detail["changes"]}


# --- Asset auditing ------------------------------------------------------


def test_asset_create_writes_one_create_event(auth_client: TestClient) -> None:
    asset = _create_asset(auth_client, name="audit-create-db")

    events = _events(auth_client, entity_type="Asset", action="CREATE")
    mine = [e for e in events if e["entity_id"] == asset["id"]]
    assert len(mine) == 1
    ev = mine[0]
    assert ev["action"] == "CREATE"
    assert ev["entity_type"] == "Asset"
    assert ev["entity_label"] == "audit-create-db"
    assert ev["actor_email"] == CREDS["email"]
    assert ev["change_count"] == 0

    detail = _detail(auth_client, ev["id"])
    assert detail["metadata"]["environment"] == "Production"
    assert detail["request_id"]  # correlation id captured


def test_asset_update_records_only_changed_fields(auth_client: TestClient) -> None:
    asset = _create_asset(auth_client, name="audit-update-db", status="Operational")
    resp = auth_client.patch(
        f"{ASSETS}/{asset['id']}",
        json={"status": "Degraded", "description": "under load"},
    )
    assert resp.status_code == 200

    events = _events(auth_client, entity_id=asset["id"], action="UPDATE")
    assert len(events) == 1
    detail = _detail(auth_client, events[0]["id"])
    changes = _changes_by_field(detail)
    assert changes["status"] == ("Operational", "Degraded")
    assert changes["description"] == (None, "under load")
    assert "name" not in changes  # unchanged field is not recorded


def test_asset_update_with_no_effective_change_writes_nothing(auth_client: TestClient) -> None:
    asset = _create_asset(auth_client, name="audit-noop-db", status="Operational")
    before = len(_events(auth_client, entity_id=asset["id"]))
    resp = auth_client.patch(f"{ASSETS}/{asset['id']}", json={"status": "Operational"})
    assert resp.status_code == 200
    assert len(_events(auth_client, entity_id=asset["id"])) == before


def test_asset_deactivate_and_idempotent_reactivate(auth_client: TestClient) -> None:
    asset = _create_asset(auth_client, name="audit-deact-db")

    assert auth_client.post(f"{ASSETS}/{asset['id']}/deactivate").status_code == 200
    status_events = _events(auth_client, entity_id=asset["id"], action="STATUS_CHANGED")
    assert len(status_events) == 1
    changes = _changes_by_field(_detail(auth_client, status_events[0]["id"]))
    assert changes["is_active"] == ("true", "false")

    # Deactivating again is a no-op -> no second event.
    assert auth_client.post(f"{ASSETS}/{asset['id']}/deactivate").status_code == 200
    assert len(_events(auth_client, entity_id=asset["id"], action="STATUS_CHANGED")) == 1


# --- Incident auditing --------------------------------------------------


def test_incident_create_and_field_update(auth_client: TestClient) -> None:
    incident = _create_incident(auth_client, title="audit-inc-1")

    created = _events(auth_client, entity_id=incident["id"], action="CREATE")
    assert len(created) == 1
    assert created[0]["entity_type"] == "Incident"

    resp = auth_client.patch(
        f"{INCIDENTS}/{incident['id']}", json={"title": "audit-inc-1-renamed", "owner": "sre"}
    )
    assert resp.status_code == 200
    updated = _events(auth_client, entity_id=incident["id"], action="UPDATE")
    assert len(updated) == 1
    changes = _changes_by_field(_detail(auth_client, updated[0]["id"]))
    assert changes["title"] == ("audit-inc-1", "audit-inc-1-renamed")
    assert changes["owner"] == (None, "sre")


def test_incident_status_change_resolve_reopen(auth_client: TestClient) -> None:
    incident = _create_incident(auth_client, title="audit-inc-status")
    iid = incident["id"]

    # Active -> active transition is STATUS_CHANGED.
    patched = auth_client.patch(f"{INCIDENTS}/{iid}", json={"status": "Investigating"})
    assert patched.status_code == 200
    sc = _events(auth_client, entity_id=iid, action="STATUS_CHANGED")
    assert len(sc) == 1
    sc_changes = _changes_by_field(_detail(auth_client, sc[0]["id"]))
    assert sc_changes["status"] == ("Open", "Investigating")

    # Crossing into a terminal state is RESOLVED.
    assert auth_client.post(f"{INCIDENTS}/{iid}/resolve").status_code == 200
    resolved = _events(auth_client, entity_id=iid, action="RESOLVED")
    assert len(resolved) == 1
    assert _changes_by_field(_detail(auth_client, resolved[0]["id"]))["status"][1] == "Resolved"

    # Leaving a terminal state is REOPENED.
    assert auth_client.post(f"{INCIDENTS}/{iid}/reopen").status_code == 200
    reopened = _events(auth_client, entity_id=iid, action="REOPENED")
    assert len(reopened) == 1


def test_incident_relation_change_is_audited(auth_client: TestClient) -> None:
    incident = _create_incident(auth_client, title="audit-inc-rel")
    a1 = _create_asset(auth_client, name="rel-asset-1")
    a2 = _create_asset(auth_client, name="rel-asset-2", asset_type="Server")

    resp = auth_client.patch(
        f"{INCIDENTS}/{incident['id']}", json={"asset_ids": [a1["id"], a2["id"]]}
    )
    assert resp.status_code == 200

    rel = _events(auth_client, entity_id=incident["id"], action="RELATION_CHANGED")
    assert len(rel) == 1
    detail = _detail(auth_client, rel[0]["id"])
    assert set(detail["metadata"]["relation"]["added"]) == {"rel-asset-1", "rel-asset-2"}
    changes = _changes_by_field(detail)
    assert "rel-asset-1" in (changes["affected_assets"][1] or "")


# --- Authentication auditing ------------------------------------------


def test_login_writes_login_event(auth_client: TestClient) -> None:
    # auth_client already logged in during the fixture.
    logins = _events(auth_client, action="LOGIN")
    assert logins
    ev = logins[0]
    assert ev["entity_type"] == "Authentication"
    assert ev["entity_label"] == CREDS["email"]
    assert ev["actor_email"] == CREDS["email"]
    assert ev["change_count"] == 0


def test_logout_writes_logout_event(auth_client: TestClient) -> None:
    assert auth_client.post("/api/v1/auth/logout").status_code == 200
    # A fresh authenticated client to read the log back.
    reader = auth_client
    assert reader.post("/api/v1/auth/login", json=CREDS).status_code == 200
    logouts = _events(reader, action="LOGOUT")
    assert len(logouts) == 1
    assert logouts[0]["entity_type"] == "Authentication"


def test_no_sensitive_value_is_ever_persisted(auth_client: TestClient) -> None:
    token = auth_client.cookies.get("infraguard_access")
    assert token  # sanity: we do have a session cookie

    auth_client.post("/api/v1/auth/logout")
    auth_client.post("/api/v1/auth/login", json=CREDS)

    haystack = auth_client.get(AUDIT, params={"page_size": 100}).text.lower()
    for ev in auth_client.get(AUDIT, params={"page_size": 100}).json()["items"]:
        haystack += auth_client.get(f"{AUDIT}/{ev['id']}").text.lower()

    assert CREDS["password"] not in haystack
    assert token.lower() not in haystack
    for marker in ("password", "jwt", "bearer ", "set-cookie", "authorization"):
        assert marker not in haystack


# --- Atomicity: a failed request writes no audit event ----------------


def test_record_event_is_rolled_back_with_its_transaction(db_session) -> None:
    """``record_event`` only flushes - it never commits. If the surrounding
    transaction is rolled back (request error / explicit rollback) the audit
    event must vanish with the mutation it described."""
    from sqlalchemy import func, select

    from app.models.audit import AuditEvent
    from app.services.audit import AuditContext, record_event

    ctx = AuditContext(actor_user_id=None, actor_email="rollback@example.com")
    record_event(
        db_session,
        ctx=ctx,
        action="CREATE",
        entity_type="Asset",
        entity_id="deadbeef",
        entity_label="rollback-victim",
    )
    # Visible inside the transaction...
    assert db_session.execute(
        select(func.count()).select_from(AuditEvent).where(AuditEvent.entity_id == "deadbeef")
    ).scalar_one() == 1

    db_session.rollback()

    # ...gone after rollback.
    assert db_session.execute(
        select(func.count()).select_from(AuditEvent).where(AuditEvent.entity_id == "deadbeef")
    ).scalar_one() == 0


# --- List: pagination / search / filters / detail --------------------


def test_list_is_newest_first_and_paginates(auth_client: TestClient) -> None:
    for i in range(3):
        _create_asset(auth_client, name=f"page-asset-{i}")

    page1 = auth_client.get(AUDIT, params={"page": 1, "page_size": 2}).json()
    assert page1["page_size"] == 2
    assert len(page1["items"]) == 2
    assert page1["total"] >= 3
    assert page1["total_pages"] >= 2

    page2 = auth_client.get(AUDIT, params={"page": 2, "page_size": 2}).json()
    ids1 = {e["id"] for e in page1["items"]}
    ids2 = {e["id"] for e in page2["items"]}
    assert ids1.isdisjoint(ids2)

    times = [e["occurred_at"] for e in page1["items"]]
    assert times == sorted(times, reverse=True)


def test_list_filters(auth_client: TestClient) -> None:
    asset = _create_asset(auth_client, name="filter-target-db")
    _create_incident(auth_client, title="filter-target-inc")

    only_assets = _events(auth_client, entity_type="Asset", page_size=100)
    assert only_assets and all(e["entity_type"] == "Asset" for e in only_assets)

    by_entity = _events(auth_client, entity_id=asset["id"], page_size=100)
    assert by_entity and all(e["entity_id"] == asset["id"] for e in by_entity)

    by_search = _events(auth_client, q="filter-target-db", page_size=100)
    assert by_search and all("filter-target-db" in (e["entity_label"] or "") for e in by_search)

    by_actor = _events(auth_client, actor="asset-owner", page_size=100)
    assert by_actor and all(e["actor_email"] == CREDS["email"] for e in by_actor)

    none = _events(auth_client, actor="nobody@example.invalid", page_size=100)
    assert none == []


def test_detail_404_for_unknown_event(auth_client: TestClient) -> None:
    resp = auth_client.get(f"{AUDIT}/11111111-1111-1111-1111-111111111111")
    assert resp.status_code == 404


# --- List change preview (timeline inline diffs) --------------------


def test_list_change_preview_is_bounded_ordered_and_matches_detail(
    auth_client: TestClient,
) -> None:
    asset = _create_asset(auth_client, name="preview-db", status="Operational")
    # Six changed fields in one PATCH -> change_count 6, preview capped at 3.
    resp = auth_client.patch(
        f"{ASSETS}/{asset['id']}",
        json={
            "status": "Degraded",
            "owner": "sre",
            "criticality": "High",
            "environment": "Staging",
            "hostname": "preview.internal",
            "description": "under investigation",
        },
    )
    assert resp.status_code == 200

    [update] = _events(auth_client, entity_id=asset["id"], action="UPDATE")
    assert update["change_count"] == 6
    preview = update["change_preview"]
    assert len(preview) == 3
    # Deterministic order: by field_name ascending (same as the detail endpoint).
    names = [c["field_name"] for c in preview]
    assert names == sorted(names)
    assert names == ["criticality", "description", "environment"]

    detail_changes = _changes_by_field(_detail(auth_client, update["id"]))
    for c in preview:
        assert detail_changes[c["field_name"]] == (c["old_value"], c["new_value"])


def test_login_and_create_have_empty_change_preview(auth_client: TestClient) -> None:
    asset = _create_asset(auth_client, name="preview-empty-db")

    [created] = _events(auth_client, entity_id=asset["id"], action="CREATE")
    assert created["change_count"] == 0
    assert created["change_preview"] == []

    login = _events(auth_client, action="LOGIN")[0]
    assert login["change_preview"] == []


def test_list_change_preview_redacts_sensitive_fields(db_session) -> None:
    """A sensitive field name is stored redacted, so the list preview (which
    reads stored rows verbatim) can never surface a secret."""
    from app.services.audit import (
        AuditContext,
        AuditQuery,
        FieldChange,
        list_audit_events,
        record_event,
    )

    record_event(
        db_session,
        ctx=AuditContext(actor_user_id=None, actor_email="sec@example.com"),
        action="UPDATE",
        entity_type="Asset",
        entity_id="sec-1",
        entity_label="secret-holder",
        changes=[
            FieldChange("api_token", "old-secret-value", "new-secret-value"),
            FieldChange("name", "a", "b"),
        ],
    )
    db_session.flush()

    rows, _ = list_audit_events(db_session, AuditQuery(entity_id="sec-1"))
    [row] = rows
    values = {c.field_name: (c.old_value, c.new_value) for c in row.change_preview}
    assert values["api_token"] == ("[redacted]", "[redacted]")
    assert "old-secret-value" not in str(values)


def test_list_change_preview_is_not_n_plus_1(db_session) -> None:
    """A whole page of events with changes must not fan out into one query per
    row - the preview is a single batched fetch, regardless of page size."""
    from sqlalchemy import event as sa_event
    from sqlalchemy.engine import Engine

    from app.services.audit import (
        AuditContext,
        AuditQuery,
        FieldChange,
        list_audit_events,
        record_event,
    )

    ctx = AuditContext(actor_user_id=None, actor_email="batch@example.com")
    for i in range(8):
        record_event(
            db_session,
            ctx=ctx,
            action="UPDATE",
            entity_type="Asset",
            entity_id=f"batch-{i}",
            entity_label=f"batch-{i}",
            changes=[
                FieldChange("status", "Operational", "Degraded"),
                FieldChange("owner", None, "x"),
            ],
        )
    db_session.flush()

    statements: list[str] = []

    def _record(conn, cursor, statement, *_a, **_k):  # noqa: ANN001
        statements.append(statement)

    query = AuditQuery(actor="batch@example.com", page_size=50)
    sa_event.listen(Engine, "before_cursor_execute", _record)
    try:
        rows, total = list_audit_events(db_session, query)
    finally:
        sa_event.remove(Engine, "before_cursor_execute", _record)

    assert total >= 8
    assert all(len(r.change_preview) == 2 for r in rows)
    # The preview is the only standalone SELECT against audit_changes (the page
    # query references the table too, but as a correlated count subquery).
    preview_selects = [
        s
        for s in statements
        if "audit_changes" in s.lower() and "audit_events" not in s.lower()
    ]
    assert len(preview_selects) == 1, preview_selects


def test_summary_counts_today(auth_client: TestClient) -> None:
    _create_asset(auth_client, name="summary-db")
    summary = auth_client.get(f"{AUDIT}/summary").json()
    assert summary["events_today"] >= 1
    assert summary["logins_today"] >= 1
    assert summary["active_actors_today"] >= 1
    assert summary["changes_today"] >= 0


# --- Access + error handling -----------------------------------------


def test_audit_requires_authentication(client: TestClient) -> None:
    assert client.get(AUDIT).status_code == 401
    assert client.get(f"{AUDIT}/summary").status_code == 401


def test_list_when_database_errors_is_generic_503(auth_client: TestClient, monkeypatch) -> None:
    from sqlalchemy.exc import OperationalError

    def _boom(*_a, **_k):
        raise OperationalError("SELECT", {}, Exception("connection refused"))

    monkeypatch.setattr("app.api.v1.routes.audit.list_audit_events", _boom)
    resp = auth_client.get(AUDIT)
    assert resp.status_code == 503
    lowered = resp.text.lower()
    for marker in ("psycopg", "traceback", "operationalerror", "connection refused"):
        assert marker not in lowered
