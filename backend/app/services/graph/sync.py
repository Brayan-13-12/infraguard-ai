"""Project the canonical PostgreSQL relationship graph into Neo4j.

Every function here is **best-effort**: on any Neo4j failure it logs a
warning and returns - it never raises into a caller that has already
committed a PostgreSQL mutation (§44 - "PostgreSQL commit succeeds, graph
sync attempts afterward"). When Neo4j is not configured every function is a
silent no-op.

Graph schema
------------
``(:Asset {id, name, asset_type, environment, criticality, status,
is_active, trashed})`` - one node per Asset (including trashed ones, flagged
``trashed: true`` rather than removed, so a restore only has to flip the
flag; a full rebuild reconciles this either way).

``(:Asset)-[:DEPENDS_ON {relationship_id}]->(:Asset)`` (and one Cypher
relationship type per :class:`~app.models.relationship.RelationshipType`,
UPPERCASED) - the relationship type name comes **only** from
:data:`_CYPHER_REL_TYPE`, a fixed allow-list keyed by the canonical taxonomy;
it is never built from unvalidated input. ``relationship_id`` carries the
canonical PostgreSQL UUID so an edge can be found/removed by identity, never
by re-deriving it from endpoint names.
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.asset import Asset
from app.models.relationship import RELATIONSHIP_TYPE_CATALOG, AssetRelationship
from app.services.graph import client

logger = logging.getLogger(__name__)

#: Cypher relationship type per InfraGuard ``relationship_type`` - a fixed
#: allow-list, never string-built from a request value (§42/§48).
_CYPHER_REL_TYPE: dict[str, str] = {code: code.upper() for code in RELATIONSHIP_TYPE_CATALOG}

_PRUNE_CHUNK = 500


def _asset_props(asset: Asset) -> dict[str, object]:
    return {
        "id": str(asset.id),
        "name": asset.name,
        "asset_type": asset.asset_type,
        "environment": asset.environment,
        "criticality": asset.criticality,
        "status": asset.status,
        "is_active": asset.is_active,
        "trashed": asset.deleted_at is not None,
    }


def upsert_asset(asset: Asset) -> bool:
    """Returns whether the projection actually succeeded (used by
    :func:`full_rebuild` for an honest summary - callers that fire this
    best-effort after a request generally ignore the return value)."""
    if not client.configured():
        return False
    try:
        client.run(
            "MERGE (a:Asset {id: $id}) SET a += $props",
            id=str(asset.id),
            props=_asset_props(asset),
        )
        return True
    except client.GraphUnavailable:
        logger.warning("Neo4j sync: asset %s not projected (graph unavailable)", asset.id)
        return False


def remove_asset(asset_id: uuid.UUID) -> None:
    if not client.configured():
        return
    try:
        client.run("MATCH (a:Asset {id: $id}) DETACH DELETE a", id=str(asset_id))
    except client.GraphUnavailable:
        logger.warning("Neo4j sync: asset %s not removed (graph unavailable)", asset_id)


def upsert_edge(rel: AssetRelationship) -> bool:
    if not client.configured():
        return False
    rel_type = _CYPHER_REL_TYPE.get(rel.relationship_type)
    if rel_type is None:  # pragma: no cover - the DB CHECK already guards this
        logger.warning("Neo4j sync: unknown relationship_type %r, skipped", rel.relationship_type)
        return False
    try:
        client.run(
            f"MATCH (s:Asset {{id: $source_id}}), (t:Asset {{id: $target_id}}) "
            f"MERGE (s)-[r:{rel_type} {{relationship_id: $rel_id}}]->(t)",
            source_id=str(rel.source_asset_id),
            target_id=str(rel.target_asset_id),
            rel_id=str(rel.id),
        )
        return True
    except client.GraphUnavailable:
        logger.warning("Neo4j sync: relationship %s not projected (graph unavailable)", rel.id)
        return False


def remove_edge(relationship_id: uuid.UUID) -> None:
    if not client.configured():
        return
    try:
        client.run(
            "MATCH ()-[r {relationship_id: $rel_id}]->() DELETE r",
            rel_id=str(relationship_id),
        )
    except client.GraphUnavailable:
        logger.warning(
            "Neo4j sync: relationship %s not removed (graph unavailable)", relationship_id
        )


def full_rebuild(db: Session) -> dict[str, int]:
    """Read every Asset + canonical relationship from PostgreSQL, upsert the
    full projection, then prune any ``:Asset`` node or InfraGuard-typed edge
    that no longer exists canonically. Scoped strictly to the ``:Asset``
    label and the fixed relationship-type allow-list - never touches other
    graph data that might share the same Neo4j database (§43).

    A no-op returning zeros when Neo4j is not configured.
    """
    if not client.configured():
        return {"nodes": 0, "edges": 0, "removed_nodes": 0, "removed_edges": 0}

    logger.info("Neo4j sync: full rebuild started")
    assets = db.execute(select(Asset)).scalars().all()
    relationships = db.execute(select(AssetRelationship)).scalars().all()

    nodes_ok = sum(1 for asset in assets if upsert_asset(asset))
    edges_ok = sum(1 for rel in relationships if upsert_edge(rel))

    removed_nodes = _prune_nodes({str(a.id) for a in assets})
    removed_edges = _prune_edges({str(r.id) for r in relationships})

    result = {
        "nodes": nodes_ok,
        "edges": edges_ok,
        "removed_nodes": removed_nodes,
        "removed_edges": removed_edges,
    }
    logger.info("Neo4j sync: full rebuild complete - %s", result)
    return result


def _prune_nodes(live_ids: set[str]) -> int:
    try:
        rows = client.run("MATCH (a:Asset) RETURN a.id AS id")
    except client.GraphUnavailable:
        logger.warning("Neo4j sync: prune skipped (graph unavailable)")
        return 0
    stale = [r["id"] for r in rows if r["id"] not in live_ids]
    for i in range(0, len(stale), _PRUNE_CHUNK):
        chunk = stale[i : i + _PRUNE_CHUNK]
        try:
            client.run("MATCH (a:Asset) WHERE a.id IN $ids DETACH DELETE a", ids=chunk)
        except client.GraphUnavailable:
            logger.warning("Neo4j sync: failed to prune a stale-node chunk")
    return len(stale)


def _prune_edges(live_ids: set[str]) -> int:
    try:
        rows = client.run(
            "MATCH ()-[r]->() WHERE r.relationship_id IS NOT NULL "
            "RETURN r.relationship_id AS id"
        )
    except client.GraphUnavailable:
        logger.warning("Neo4j sync: prune skipped (graph unavailable)")
        return 0
    stale = [r["id"] for r in rows if r["id"] not in live_ids]
    for i in range(0, len(stale), _PRUNE_CHUNK):
        chunk = stale[i : i + _PRUNE_CHUNK]
        try:
            client.run(
                "MATCH ()-[r]->() WHERE r.relationship_id IN $ids DELETE r", ids=chunk
            )
        except client.GraphUnavailable:
            logger.warning("Neo4j sync: failed to prune a stale-edge chunk")
    return len(stale)
