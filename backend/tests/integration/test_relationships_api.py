"""Asset relationship CRUD, invariants, RBAC and Audit (Topology milestone)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integration

API = "/api/v1"
REL = f"{API}/relationships"


def _asset(client: TestClient, name: str, **overrides) -> dict:
    payload = {
        "name": name,
        "asset_type": "Server",
        "environment": "Production",
        "criticality": "High",
        "status": "Operational",
    }
    payload.update(overrides)
    r = client.post(f"{API}/assets", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def test_create_relationship_grouped_read_and_delete(auth_client: TestClient) -> None:
    a = _asset(auth_client, "rel-a-01")
    b = _asset(auth_client, "rel-b-01")

    r = auth_client.post(
        REL,
        json={
            "source_asset_id": a["id"],
            "target_asset_id": b["id"],
            "relationship_type": "depends_on",
            "description": "necesita la base de datos",
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["source"]["id"] == a["id"]
    assert body["target"]["id"] == b["id"]
    assert body["relationship_type"] == "depends_on"

    grouped_a = auth_client.get(f"{API}/assets/{a['id']}/relationships").json()
    assert grouped_a["counts"] == {"outgoing": 1, "incoming": 0, "total": 1}
    assert grouped_a["outgoing"][0]["target"]["name"] == "rel-b-01"

    grouped_b = auth_client.get(f"{API}/assets/{b['id']}/relationships").json()
    assert grouped_b["counts"] == {"outgoing": 0, "incoming": 1, "total": 1}
    assert grouped_b["incoming"][0]["source"]["name"] == "rel-a-01"

    rid = body["id"]
    assert auth_client.delete(f"{REL}/{rid}").status_code == 200
    assert auth_client.get(f"{REL}/{rid}").status_code == 404


def test_self_link_rejected(auth_client: TestClient) -> None:
    a = _asset(auth_client, "rel-self-01")
    r = auth_client.post(
        REL,
        json={"source_asset_id": a["id"], "target_asset_id": a["id"], "relationship_type": "uses"},
    )
    assert r.status_code == 422


def test_duplicate_edge_rejected(auth_client: TestClient) -> None:
    a = _asset(auth_client, "rel-dup-a")
    b = _asset(auth_client, "rel-dup-b")
    payload = {"source_asset_id": a["id"], "target_asset_id": b["id"], "relationship_type": "uses"}
    assert auth_client.post(REL, json=payload).status_code == 201
    dupe = auth_client.post(REL, json=payload)
    assert dupe.status_code == 409

    # the inverse direction is a distinct, independently valid edge (§8)
    inverse = {"source_asset_id": b["id"], "target_asset_id": a["id"], "relationship_type": "uses"}
    assert auth_client.post(REL, json=inverse).status_code == 201


def test_unknown_relationship_type_rejected(auth_client: TestClient) -> None:
    a = _asset(auth_client, "rel-type-a")
    b = _asset(auth_client, "rel-type-b")
    r = auth_client.post(
        REL,
        json={
            "source_asset_id": a["id"],
            "target_asset_id": b["id"],
            "relationship_type": "orbits",
        },
    )
    assert r.status_code == 422


def test_missing_asset_rejected(auth_client: TestClient) -> None:
    a = _asset(auth_client, "rel-missing-a")
    ghost = "00000000-0000-0000-0000-000000000000"
    r = auth_client.post(
        REL,
        json={"source_asset_id": a["id"], "target_asset_id": ghost, "relationship_type": "uses"},
    )
    assert r.status_code == 404


def test_trashed_asset_cannot_receive_new_relationship(auth_client: TestClient) -> None:
    a = _asset(auth_client, "rel-trash-a")
    b = _asset(auth_client, "rel-trash-b")
    assert auth_client.delete(f"{API}/assets/{b['id']}").status_code == 200
    r = auth_client.post(
        REL,
        json={"source_asset_id": a["id"], "target_asset_id": b["id"], "relationship_type": "uses"},
    )
    assert r.status_code == 409


def test_soft_delete_preserves_relationship_and_restore_reactivates_topology(
    auth_client: TestClient,
) -> None:
    a = _asset(auth_client, "rel-preserve-a")
    b = _asset(auth_client, "rel-preserve-b")
    rel = auth_client.post(
        REL,
        json={
            "source_asset_id": a["id"],
            "target_asset_id": b["id"],
            "relationship_type": "depends_on",
        },
    ).json()

    assert auth_client.delete(f"{API}/assets/{b['id']}").status_code == 200

    # Live topology (the grouped read) excludes the trashed endpoint...
    grouped = auth_client.get(f"{API}/assets/{a['id']}/relationships").json()
    assert grouped["counts"]["total"] == 0

    # ...but the canonical row itself was NOT cascade-deleted.
    assert auth_client.get(f"{REL}/{rel['id']}").status_code == 200

    # Restoring the asset makes it reappear automatically - no explicit
    # "reactivate the relationship" step exists or is needed.
    assert auth_client.post(f"{API}/trash/assets/{b['id']}/restore").status_code == 200
    grouped_after = auth_client.get(f"{API}/assets/{a['id']}/relationships").json()
    assert grouped_after["counts"]["total"] == 1


def test_update_type_and_description_not_endpoints(auth_client: TestClient) -> None:
    a = _asset(auth_client, "rel-upd-a")
    b = _asset(auth_client, "rel-upd-b")
    rel = auth_client.post(
        REL,
        json={"source_asset_id": a["id"], "target_asset_id": b["id"], "relationship_type": "uses"},
    ).json()

    r = auth_client.patch(
        f"{REL}/{rel['id']}", json={"relationship_type": "depends_on", "description": "actualizado"}
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["relationship_type"] == "depends_on"
    assert body["description"] == "actualizado"
    assert body["source"]["id"] == a["id"]  # endpoints unchanged
    assert body["target"]["id"] == b["id"]

    # PATCH schema has no source/target fields at all - not just ignored.
    forbidden = auth_client.patch(f"{REL}/{rel['id']}", json={"source_asset_id": b["id"]})
    assert forbidden.status_code == 422


def test_update_to_duplicate_type_rejected(auth_client: TestClient) -> None:
    a = _asset(auth_client, "rel-upddup-a")
    b = _asset(auth_client, "rel-upddup-b")
    auth_client.post(
        REL,
        json={"source_asset_id": a["id"], "target_asset_id": b["id"], "relationship_type": "uses"},
    )
    rel2 = auth_client.post(
        REL,
        json={
            "source_asset_id": a["id"],
            "target_asset_id": b["id"],
            "relationship_type": "depends_on",
        },
    ).json()
    r = auth_client.patch(f"{REL}/{rel2['id']}", json={"relationship_type": "uses"})
    assert r.status_code == 409


def test_audit_records_create_update_delete(auth_client: TestClient) -> None:
    a = _asset(auth_client, "rel-audit-a")
    b = _asset(auth_client, "rel-audit-b")
    rel = auth_client.post(
        REL,
        json={"source_asset_id": a["id"], "target_asset_id": b["id"], "relationship_type": "uses"},
    ).json()
    auth_client.patch(f"{REL}/{rel['id']}", json={"description": "nota"})
    auth_client.delete(f"{REL}/{rel['id']}")

    events = auth_client.get(f"{API}/audit?entity_type=Relationship&entity_id={rel['id']}").json()
    actions = {e["action"] for e in events["items"]}
    assert actions == {"CREATE", "UPDATE", "DELETE"}


def test_rbac_read_and_manage_enforced(make_client: object, auth_client: TestClient) -> None:
    a = _asset(auth_client, "rel-rbac-a")
    b = _asset(auth_client, "rel-rbac-b")

    viewer = make_client("rel-viewer@example.com", roles=["viewer"])
    # Viewer has relationships.read (default system-role grant) but not manage.
    assert viewer.get(REL).status_code == 200
    assert (
        viewer.post(
            REL,
            json={
                "source_asset_id": a["id"],
                "target_asset_id": b["id"],
                "relationship_type": "uses",
            },
        ).status_code
        == 403
    )

    none_role = make_client("rel-none@example.com", roles=[])
    assert none_role.get(REL).status_code == 403

    operator = make_client("rel-operator@example.com", roles=["operator"])
    created = operator.post(
        REL,
        json={"source_asset_id": a["id"], "target_asset_id": b["id"], "relationship_type": "uses"},
    )
    assert created.status_code == 201
    rid = created.json()["id"]
    assert operator.patch(f"{REL}/{rid}", json={"description": "ok"}).status_code == 200
    assert operator.delete(f"{REL}/{rid}").status_code == 200


def test_unauthenticated_requests_rejected() -> None:
    from app.main import app

    anon = TestClient(app, base_url="http://localhost:8000")
    assert anon.get(REL).status_code == 401


def test_relationship_type_catalog_endpoint(auth_client: TestClient) -> None:
    body = auth_client.get(f"{REL}/types").json()
    codes = {t["code"] for t in body["types"]}
    assert codes == {
        "depends_on",
        "hosts",
        "connects_to",
        "uses",
        "provides_service_to",
        "member_of",
    }
    for t in body["types"]:
        assert t["label"] and t["inverse_label"] and t["description"]


def test_asset_scoped_direction_and_filters(auth_client: TestClient) -> None:
    a = _asset(auth_client, "rel-filter-a", environment="Production", criticality="Critical")
    b = _asset(auth_client, "rel-filter-b", environment="Staging", criticality="Low")
    auth_client.post(
        REL,
        json={"source_asset_id": a["id"], "target_asset_id": b["id"], "relationship_type": "uses"},
    )
    only_outgoing = auth_client.get(f"{REL}?asset_id={a['id']}&direction=outgoing").json()
    assert only_outgoing["total"] == 1
    only_incoming = auth_client.get(f"{REL}?asset_id={a['id']}&direction=incoming").json()
    assert only_incoming["total"] == 0
    filtered = auth_client.get(
        f"{REL}?asset_id={a['id']}&direction=outgoing&environment=Staging"
    ).json()
    assert filtered["total"] == 1
    filtered_out = auth_client.get(
        f"{REL}?asset_id={a['id']}&direction=outgoing&environment=Production"
    ).json()
    assert filtered_out["total"] == 0


def test_global_filters_match_either_endpoint(auth_client: TestClient) -> None:
    """Without asset_id (the global Dependencias module), environment /
    criticality / asset_type match *either* endpoint - unlike the
    asset-scoped "other endpoint only" semantics above."""
    a = _asset(
        auth_client,
        "rel-global-a",
        asset_type="Application",
        environment="Production",
        criticality="Critical",
    )
    b = _asset(
        auth_client,
        "rel-global-b",
        asset_type="Database",
        environment="Staging",
        criticality="Low",
    )
    auth_client.post(
        REL,
        json={"source_asset_id": a["id"], "target_asset_id": b["id"], "relationship_type": "uses"},
    )

    by_source_env = auth_client.get(f"{REL}?environment=Production").json()
    assert any(i["id"] for i in by_source_env["items"] if i["source_asset_id"] == a["id"])
    by_target_env = auth_client.get(f"{REL}?environment=Staging").json()
    assert any(i["id"] for i in by_target_env["items"] if i["target_asset_id"] == b["id"])
    by_source_type = auth_client.get(f"{REL}?asset_type=Application").json()
    assert any(i["source_asset_id"] == a["id"] for i in by_source_type["items"])
    by_target_criticality = auth_client.get(f"{REL}?criticality=Low").json()
    assert any(i["target_asset_id"] == b["id"] for i in by_target_criticality["items"])
    no_match = auth_client.get(f"{REL}?environment=Test").json()
    assert not any(
        i["source_asset_id"] == a["id"] or i["target_asset_id"] == b["id"]
        for i in no_match["items"]
    )


def test_search_matches_name_hostname_and_description(auth_client: TestClient) -> None:
    a = _asset(auth_client, "rel-search-source", hostname="search-src.internal")
    b = _asset(auth_client, "rel-search-target", hostname="search-tgt.internal")
    auth_client.post(
        REL,
        json={
            "source_asset_id": a["id"],
            "target_asset_id": b["id"],
            "relationship_type": "connects_to",
            "description": "unique-search-phrase",
        },
    )

    by_source_name = auth_client.get(f"{REL}?search=rel-search-source").json()
    assert by_source_name["total"] == 1
    by_target_hostname = auth_client.get(f"{REL}?search=search-tgt.internal").json()
    assert by_target_hostname["total"] == 1
    by_description = auth_client.get(f"{REL}?search=unique-search-phrase").json()
    assert by_description["total"] == 1
    no_match = auth_client.get(f"{REL}?search=totally-unrelated-term-xyz").json()
    assert no_match["total"] == 0


def test_relationship_summary_endpoint(auth_client: TestClient) -> None:
    a = _asset(auth_client, "rel-summary-a")
    b = _asset(auth_client, "rel-summary-b")
    _asset(auth_client, "rel-summary-c")  # unrelated - counts toward the unrelated tally
    auth_client.post(
        REL,
        json={"source_asset_id": a["id"], "target_asset_id": b["id"], "relationship_type": "uses"},
    )

    before = auth_client.get(f"{REL}/summary").json()
    after_create = {
        "total",
        "connected_assets",
        "relationship_types",
        "assets_without_relationships",
    }
    assert set(before) == after_create
    assert before["relationship_types"] == 6
    assert before["total"] >= 1
    assert before["connected_assets"] >= 2

    # `c` was created but never related - it must count toward the unrelated tally.
    assert before["assets_without_relationships"] >= 1


def test_relationship_summary_requires_read_permission(
    auth_client: TestClient, make_client
) -> None:
    no_role = make_client("rel-summary-none@example.com", roles=[])
    assert no_role.get(f"{REL}/summary").status_code == 403
