"""Neo4j projection sync - fully mocked client, no real Neo4j required (§68)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from unittest.mock import MagicMock

import pytest

from app.services.graph import client, sync


@dataclass
class _FakeAsset:
    id: uuid.UUID
    name: str = "fake-asset"
    asset_type: str = "Server"
    environment: str = "Production"
    criticality: str = "High"
    status: str = "Operational"
    is_active: bool = True
    deleted_at: object = None


@dataclass
class _FakeRelationship:
    id: uuid.UUID
    source_asset_id: uuid.UUID
    target_asset_id: uuid.UUID
    relationship_type: str = "depends_on"


@pytest.fixture(autouse=True)
def _not_configured_by_default(monkeypatch: pytest.MonkeyPatch):
    """Every test explicitly opts into "configured" via the fixtures below -
    keeps the not-configured no-op path exercised by default."""
    monkeypatch.setattr(client, "configured", lambda: False)
    yield


def test_sync_is_a_no_op_when_neo4j_not_configured() -> None:
    asset = _FakeAsset(id=uuid.uuid4())
    assert sync.upsert_asset(asset) is False
    sync.remove_asset(asset.id)  # must not raise
    rel = _FakeRelationship(
        id=uuid.uuid4(), source_asset_id=uuid.uuid4(), target_asset_id=uuid.uuid4()
    )
    assert sync.upsert_edge(rel) is False
    sync.remove_edge(rel.id)  # must not raise


def test_upsert_asset_calls_run_with_merge_and_props(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(client, "configured", lambda: True)
    run = MagicMock(return_value=[])
    monkeypatch.setattr(client, "run", run)

    asset = _FakeAsset(id=uuid.uuid4(), name="prod-api-01")
    assert sync.upsert_asset(asset) is True

    run.assert_called_once()
    query, kwargs = run.call_args[0][0], run.call_args[1]
    assert "MERGE" in query and "Asset" in query
    assert kwargs["id"] == str(asset.id)
    assert kwargs["props"]["name"] == "prod-api-01"
    assert kwargs["props"]["trashed"] is False


def test_upsert_asset_marks_trashed_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(client, "configured", lambda: True)
    run = MagicMock(return_value=[])
    monkeypatch.setattr(client, "run", run)

    asset = _FakeAsset(id=uuid.uuid4(), deleted_at="2026-01-01T00:00:00Z")
    sync.upsert_asset(asset)
    assert run.call_args[1]["props"]["trashed"] is True


def test_upsert_edge_uses_allowlisted_cypher_type_from_relationship_type(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(client, "configured", lambda: True)
    run = MagicMock(return_value=[])
    monkeypatch.setattr(client, "run", run)

    rel = _FakeRelationship(
        id=uuid.uuid4(),
        source_asset_id=uuid.uuid4(),
        target_asset_id=uuid.uuid4(),
        relationship_type="depends_on",
    )
    assert sync.upsert_edge(rel) is True
    query = run.call_args[0][0]
    assert ":DEPENDS_ON" in query
    assert run.call_args[1]["rel_id"] == str(rel.id)


def test_upsert_edge_rejects_unknown_relationship_type(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(client, "configured", lambda: True)
    run = MagicMock(return_value=[])
    monkeypatch.setattr(client, "run", run)

    rel = _FakeRelationship(
        id=uuid.uuid4(),
        source_asset_id=uuid.uuid4(),
        target_asset_id=uuid.uuid4(),
        relationship_type="not_a_real_type",
    )
    assert sync.upsert_edge(rel) is False
    run.assert_not_called()


def test_remove_edge_deletes_by_relationship_id(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(client, "configured", lambda: True)
    run = MagicMock(return_value=[])
    monkeypatch.setattr(client, "run", run)

    rid = uuid.uuid4()
    sync.remove_edge(rid)
    query = run.call_args[0][0]
    assert "DELETE" in query
    assert run.call_args[1]["rel_id"] == str(rid)


def test_neo4j_unavailable_during_upsert_is_swallowed_not_raised(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(client, "configured", lambda: True)

    def _boom(*a, **kw):
        raise client.GraphUnavailable("connection refused")

    monkeypatch.setattr(client, "run", _boom)
    asset = _FakeAsset(id=uuid.uuid4())
    # Must not raise - a PostgreSQL mutation must never fail because of this (§44).
    assert sync.upsert_asset(asset) is False


def test_full_rebuild_is_a_no_op_when_not_configured() -> None:
    result = sync.full_rebuild(db=MagicMock())
    assert result == {"nodes": 0, "edges": 0, "removed_nodes": 0, "removed_edges": 0}


def test_full_rebuild_upserts_all_and_prunes_stale(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(client, "configured", lambda: True)

    live_asset = _FakeAsset(id=uuid.uuid4(), name="live")
    live_rel = _FakeRelationship(
        id=uuid.uuid4(), source_asset_id=live_asset.id, target_asset_id=uuid.uuid4()
    )
    stale_node_id = str(uuid.uuid4())
    stale_edge_id = str(uuid.uuid4())

    db = MagicMock()
    db.execute.return_value.scalars.return_value.all.side_effect = [[live_asset], [live_rel]]

    calls: list[tuple[str, dict]] = []

    def _fake_run(query: str, **kwargs):
        calls.append((query, kwargs))
        if "RETURN a.id" in query:
            return [{"id": str(live_asset.id)}, {"id": stale_node_id}]
        if "RETURN r.relationship_id" in query:
            return [{"id": str(live_rel.id)}, {"id": stale_edge_id}]
        return []

    monkeypatch.setattr(client, "run", _fake_run)

    result = sync.full_rebuild(db)
    assert result == {"nodes": 1, "edges": 1, "removed_nodes": 1, "removed_edges": 1}

    prune_node_calls = [c for c in calls if "DETACH DELETE a" in c[0] and "$ids" in c[0]]
    assert prune_node_calls and prune_node_calls[0][1]["ids"] == [stale_node_id]
    prune_edge_calls = [
        c for c in calls if c[0].startswith("MATCH ()-[r]->() WHERE r.relationship_id IN")
    ]
    assert prune_edge_calls and prune_edge_calls[0][1]["ids"] == [stale_edge_id]


def test_check_health_not_configured() -> None:
    status, detail = client.check_health()
    assert status == "not_configured"
    assert detail is None


def test_check_health_operational(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(client, "configured", lambda: True)
    monkeypatch.setattr(client, "run", lambda *a, **kw: [{"ok": 1}])
    status, detail = client.check_health()
    assert status == "operational"
    assert detail is None


def test_check_health_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(client, "configured", lambda: True)

    def _boom(*a, **kw):
        raise client.GraphUnavailable("timeout")

    monkeypatch.setattr(client, "run", _boom)
    status, detail = client.check_health()
    assert status == "unavailable"
    assert detail
