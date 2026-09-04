"""Bounded topology queries: subgraph, impact, path, RBAC, cycles (§65-67)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integration

API = "/api/v1"
REL = f"{API}/relationships"
TOPO = f"{API}/topology"


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


def _link(client: TestClient, source: dict, rel_type: str, target: dict) -> dict:
    r = client.post(
        REL,
        json={
            "source_asset_id": source["id"],
            "target_asset_id": target["id"],
            "relationship_type": rel_type,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


@pytest.fixture
def chain(auth_client: TestClient) -> dict:
    """web -> api -> db, api uses cache. Depth-1 from api sees {api, db, cache,
    web}; depth-2 adds nothing further (chain is only 3 deep)."""
    web = _asset(auth_client, "topo-web-01")
    api = _asset(auth_client, "topo-api-01")
    db = _asset(auth_client, "topo-db-01")
    cache = _asset(auth_client, "topo-cache-01")
    _link(auth_client, web, "depends_on", api)
    _link(auth_client, api, "depends_on", db)
    _link(auth_client, api, "uses", cache)
    return {"web": web, "api": api, "db": db, "cache": cache}


def test_subgraph_depth_1_and_2(auth_client: TestClient, chain: dict) -> None:
    d1 = auth_client.get(f"{TOPO}/subgraph?root_asset_id={chain['api']['id']}&depth=1").json()
    names = {n["name"] for n in d1["nodes"]}
    assert names == {"topo-api-01", "topo-web-01", "topo-db-01", "topo-cache-01"}
    assert d1["depth"] == 1
    assert d1["source"] == "postgres"

    root_node = next(n for n in d1["nodes"] if n["id"] == chain["api"]["id"])
    assert root_node["is_root"] is True

    d0 = auth_client.get(f"{TOPO}/subgraph?root_asset_id={chain['api']['id']}&depth=0").json()
    assert [n["name"] for n in d0["nodes"]] == ["topo-api-01"]
    assert d0["edges"] == []


def test_subgraph_direction_upstream_downstream(auth_client: TestClient, chain: dict) -> None:
    # api depends_on db -> db is upstream of api; web depends_on api -> web is downstream of api.
    up = auth_client.get(
        f"{TOPO}/subgraph?root_asset_id={chain['api']['id']}&depth=1&direction=upstream"
    ).json()
    up_names = {n["name"] for n in up["nodes"]}
    assert up_names == {"topo-api-01", "topo-db-01", "topo-cache-01"}
    assert "topo-web-01" not in up_names

    down = auth_client.get(
        f"{TOPO}/subgraph?root_asset_id={chain['api']['id']}&depth=1&direction=downstream"
    ).json()
    down_names = {n["name"] for n in down["nodes"]}
    assert down_names == {"topo-api-01", "topo-web-01"}


def test_subgraph_relationship_type_and_env_criticality_filters(
    auth_client: TestClient, chain: dict
) -> None:
    only_uses = auth_client.get(
        f"{TOPO}/subgraph?root_asset_id={chain['api']['id']}&depth=1&relationship_type=uses"
    ).json()
    assert {n["name"] for n in only_uses["nodes"]} == {"topo-api-01", "topo-cache-01"}

    filtered = auth_client.get(
        f"{TOPO}/subgraph?root_asset_id={chain['api']['id']}&depth=1&criticality=Critical"
    ).json()
    # neighbors are High criticality by default fixture -> filtered out, root stays.
    assert {n["name"] for n in filtered["nodes"]} == {"topo-api-01"}


def test_subgraph_node_cap_truncates(auth_client: TestClient, chain: dict) -> None:
    capped = auth_client.get(
        f"{TOPO}/subgraph?root_asset_id={chain['api']['id']}&depth=1&node_cap=2"
    ).json()
    assert len(capped["nodes"]) <= 2
    assert capped["truncated"] is True


def test_subgraph_excludes_trashed_asset(auth_client: TestClient, chain: dict) -> None:
    auth_client.delete(f"{API}/assets/{chain['db']['id']}")
    d1 = auth_client.get(f"{TOPO}/subgraph?root_asset_id={chain['api']['id']}&depth=1").json()
    assert "topo-db-01" not in {n["name"] for n in d1["nodes"]}


def test_subgraph_missing_or_trashed_root_is_404(auth_client: TestClient, chain: dict) -> None:
    ghost = "00000000-0000-0000-0000-000000000000"
    assert auth_client.get(f"{TOPO}/subgraph?root_asset_id={ghost}").status_code == 404
    auth_client.delete(f"{API}/assets/{chain['web']['id']}")
    assert auth_client.get(f"{TOPO}/subgraph?root_asset_id={chain['web']['id']}").status_code == 404


def test_impact_propagates_through_depends_on_not_connects_to(auth_client: TestClient) -> None:
    a = _asset(auth_client, "impact-a")
    b = _asset(auth_client, "impact-b")
    c = _asset(auth_client, "impact-c")
    unrelated = _asset(auth_client, "impact-informational")
    # c depends_on b, b depends_on a -> impact(a) = {b (d1), c (d2)}
    _link(auth_client, c, "depends_on", b)
    _link(auth_client, b, "depends_on", a)
    # informational-only edge must NOT propagate impact.
    _link(auth_client, unrelated, "connects_to", a)

    impact = auth_client.get(f"{TOPO}/assets/{a['id']}/impact?max_depth=3").json()
    affected = {x["asset"]["name"]: x["distance"] for x in impact["affected_assets"]}
    assert affected == {"impact-b": 1, "impact-c": 2}
    assert "impact-informational" not in affected


def test_impact_max_depth_bounds_traversal(auth_client: TestClient) -> None:
    a = _asset(auth_client, "depth-a")
    b = _asset(auth_client, "depth-b")
    c = _asset(auth_client, "depth-c")
    _link(auth_client, b, "depends_on", a)
    _link(auth_client, c, "depends_on", b)
    shallow = auth_client.get(f"{TOPO}/assets/{a['id']}/impact?max_depth=1").json()
    assert {x["asset"]["name"] for x in shallow["affected_assets"]} == {"depth-b"}


def test_impact_handles_cycles_without_infinite_loop(auth_client: TestClient) -> None:
    a = _asset(auth_client, "cycle-a")
    b = _asset(auth_client, "cycle-b")
    c = _asset(auth_client, "cycle-c")
    _link(auth_client, a, "depends_on", b)
    _link(auth_client, b, "depends_on", c)
    _link(auth_client, c, "depends_on", a)  # closes the cycle

    r = auth_client.get(f"{TOPO}/assets/{a['id']}/impact?max_depth=3")
    assert r.status_code == 200
    affected = {x["asset"]["name"] for x in r.json()["affected_assets"]}
    # impact of a: c depends_on a (d1), b depends_on c (d2) - a itself never
    # reappears in its own affected list despite the cycle.
    assert affected == {"cycle-b", "cycle-c"}


def test_path_found_and_not_found(auth_client: TestClient, chain: dict) -> None:
    found = auth_client.get(
        f"{TOPO}/path?source_asset_id={chain['web']['id']}&target_asset_id={chain['db']['id']}"
    ).json()
    assert found["found"] is True
    assert [n["name"] for n in found["nodes"]] == ["topo-web-01", "topo-api-01", "topo-db-01"]
    assert found["length"] == 2

    isolated = _asset(auth_client, "topo-isolated-01")
    not_found = auth_client.get(
        f"{TOPO}/path?source_asset_id={chain['web']['id']}&target_asset_id={isolated['id']}"
    ).json()
    assert not_found["found"] is False
    assert not_found["nodes"] == []


def test_path_missing_asset_is_404(auth_client: TestClient, chain: dict) -> None:
    ghost = "00000000-0000-0000-0000-000000000000"
    r = auth_client.get(f"{TOPO}/path?source_asset_id={chain['web']['id']}&target_asset_id={ghost}")
    assert r.status_code == 404


def test_topology_rbac_requires_both_relationships_and_assets_read(
    make_client: object, auth_client: TestClient, chain: dict
) -> None:
    no_assets = make_client("topo-no-assets@example.com", roles=[])
    # give ONLY relationships.read via a custom role
    role = auth_client.post(
        f"{API}/admin/roles",
        json={"name": "Topo Relations Only", "permissions": ["relationships.read"]},
    ).json()
    me = auth_client.get(f"{API}/admin/users").json()
    target = next(u for u in me["items"] if u["email"] == "topo-no-assets@example.com")
    auth_client.put(f"{API}/admin/users/{target['id']}/roles", json={"role_ids": [role["id"]]})

    assert no_assets.get(f"{TOPO}/subgraph?root_asset_id={chain['api']['id']}").status_code == 403

    viewer = make_client("topo-viewer@example.com", roles=["viewer"])
    assert viewer.get(f"{TOPO}/subgraph?root_asset_id={chain['api']['id']}").status_code == 200
    assert viewer.get(f"{TOPO}/assets/{chain['api']['id']}/impact").status_code == 200


def test_graph_health_never_requires_neo4j_and_reports_status(auth_client: TestClient) -> None:
    r = auth_client.get(f"{TOPO}/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] in {"operational", "unavailable", "not_configured"}
    assert isinstance(body["configured"], bool)
