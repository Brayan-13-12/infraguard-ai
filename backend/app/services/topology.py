"""Bounded topology queries over the canonical PostgreSQL relationship graph.

This is the **authoritative** query implementation for v1: every topology read
(subgraph, impact, shortest path) is answered directly from
``asset_relationships`` + ``assets``, so it is always correct, always
available, and requires no Neo4j to test or run. Neo4j (``app/services/graph/``)
is a real, working *derived* projection of the same canonical data used for
sync/health/future graph-native querying - it is deliberately **not** yet on
this read path (documented decision, see ``docs/architecture.md`` §"Topology
query engine"). ``app/services/topology.py`` is therefore also exactly the
"fallback without Neo4j" behavior §47 asks for, and it never changes shape
based on whether Neo4j happens to be configured.

Traversal is a small iterative BFS (never a naive unbounded walk): at most
:data:`MAX_DEPTH` hops, at most a bounded number of nodes, and a ``visited``
set that makes cycles a non-issue (a cycle simply stops re-expanding a node
it has already seen - see the cycle test in
``tests/integration/test_topology_api.py``).

Direction semantics (§34): if ``A depends_on B`` then B is *upstream* of A
(the thing A depends on) and A is *downstream* of B. Generalised to every
relationship type: **upstream** = follow outgoing edges from the focus Asset;
**downstream** = follow incoming edges.

Impact semantics (§36): only a curated subset of relationship types is
considered to *propagate* a failure - see
``app.models.relationship.PROPAGATING_RELATIONSHIP_TYPES`` /
``impact_direction``. ``connects_to`` and ``member_of`` are informational only
and never appear in an impact path.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Literal

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.models.asset import Asset
from app.models.relationship import RELATIONSHIP_TYPE_CATALOG, AssetRelationship
from app.services.relationships import base_relationship_select, both_endpoints_live

MAX_DEPTH = 3
DEFAULT_DEPTH = 1
DEFAULT_NODE_CAP = 200
MAX_NODE_CAP = 500

TopoDirection = Literal["both", "upstream", "downstream"]

_REVERSE_IMPACT_TYPES = tuple(
    c
    for c, m in RELATIONSHIP_TYPE_CATALOG.items()
    if m.propagates_impact and m.impact_direction == "reverse"
)
_FORWARD_IMPACT_TYPES = tuple(
    c
    for c, m in RELATIONSHIP_TYPE_CATALOG.items()
    if m.propagates_impact and m.impact_direction == "forward"
)


@dataclass(frozen=True, slots=True)
class SubgraphResult:
    root: Asset
    nodes: list[Asset]
    edges: list[AssetRelationship]
    depth: int
    direction: TopoDirection
    truncated: bool


@dataclass(frozen=True, slots=True)
class ImpactedNode:
    asset: Asset
    distance: int
    path: list[uuid.UUID]


@dataclass(frozen=True, slots=True)
class ImpactResult:
    root: Asset
    affected: list[ImpactedNode]
    max_depth: int
    truncated: bool


@dataclass(frozen=True, slots=True)
class PathResult:
    found: bool
    nodes: list[Asset] = field(default_factory=list)
    edges: list[AssetRelationship] = field(default_factory=list)


def _passes_filters(
    asset: Asset, *, environment: str | None, criticality: str | None, status: str | None
) -> bool:
    if environment and asset.environment != environment:
        return False
    if criticality and asset.criticality != criticality:
        return False
    if status and asset.status != status:
        return False
    return True


def _neighbor_edges(
    db: Session,
    frontier_ids: set[uuid.UUID],
    direction: TopoDirection,
    relationship_types: tuple[str, ...],
) -> list[tuple[AssetRelationship, Asset, Asset]]:
    """Every live edge touching ``frontier_ids`` on the side ``direction`` allows."""
    conds = [both_endpoints_live()]
    if relationship_types:
        conds.append(AssetRelationship.relationship_type.in_(relationship_types))
    if direction == "upstream":
        conds.append(AssetRelationship.source_asset_id.in_(frontier_ids))
    elif direction == "downstream":
        conds.append(AssetRelationship.target_asset_id.in_(frontier_ids))
    else:
        conds.append(
            or_(
                AssetRelationship.source_asset_id.in_(frontier_ids),
                AssetRelationship.target_asset_id.in_(frontier_ids),
            )
        )
    rows = db.execute(base_relationship_select().where(*conds)).all()
    return [(r[0], r[1], r[2]) for r in rows]


def get_subgraph(
    db: Session,
    *,
    root_asset_id: uuid.UUID,
    depth: int = DEFAULT_DEPTH,
    direction: TopoDirection = "both",
    relationship_types: tuple[str, ...] = (),
    environment: str | None = None,
    criticality: str | None = None,
    status: str | None = None,
    node_cap: int = DEFAULT_NODE_CAP,
) -> SubgraphResult | None:
    """Bounded neighborhood of ``root_asset_id`` - ``None`` if the root does not
    exist or is currently in Trash (live topology excludes it, §5)."""
    root = db.get(Asset, root_asset_id)
    if root is None or root.deleted_at is not None:
        return None

    depth = max(0, min(depth, MAX_DEPTH))
    node_cap = max(1, min(node_cap, MAX_NODE_CAP))

    nodes: dict[uuid.UUID, Asset] = {root.id: root}
    edges: dict[uuid.UUID, AssetRelationship] = {}
    frontier: set[uuid.UUID] = {root.id}
    truncated = False

    for _hop in range(depth):
        if not frontier or len(nodes) >= node_cap:
            break
        rows = _neighbor_edges(db, frontier, direction, relationship_types)
        next_frontier: set[uuid.UUID] = set()
        for rel, source, target in rows:
            if rel.id in edges:
                continue
            other: Asset | None = None
            if direction != "downstream" and source.id in frontier and target.id not in nodes:
                other = target
            if (
                other is None
                and direction != "upstream"
                and target.id in frontier
                and source.id not in nodes
            ):
                other = source
            if other is not None:
                if not _passes_filters(
                    other, environment=environment, criticality=criticality, status=status
                ):
                    continue
                if len(nodes) >= node_cap:
                    truncated = True
                    continue
                nodes[other.id] = other
                next_frontier.add(other.id)
                edges[rel.id] = rel
            elif source.id in nodes and target.id in nodes:
                # both endpoints already collected - a cross-link within the
                # known set, kept for a complete (not just tree-shaped) graph.
                edges[rel.id] = rel
        frontier = next_frontier

    return SubgraphResult(
        root=root,
        nodes=list(nodes.values()),
        edges=list(edges.values()),
        depth=depth,
        direction=direction,
        truncated=truncated,
    )


def _impact_neighbor_edges(
    db: Session, frontier_ids: set[uuid.UUID]
) -> list[tuple[AssetRelationship, Asset, Asset]]:
    conds = and_(
        both_endpoints_live(),
        or_(
            and_(
                AssetRelationship.relationship_type.in_(_REVERSE_IMPACT_TYPES),
                AssetRelationship.target_asset_id.in_(frontier_ids),
            ),
            and_(
                AssetRelationship.relationship_type.in_(_FORWARD_IMPACT_TYPES),
                AssetRelationship.source_asset_id.in_(frontier_ids),
            ),
        ),
    )
    rows = db.execute(base_relationship_select().where(conds)).all()
    return [(r[0], r[1], r[2]) for r in rows]


def compute_impact(
    db: Session,
    *,
    root_asset_id: uuid.UUID,
    max_depth: int = MAX_DEPTH,
    node_cap: int = DEFAULT_NODE_CAP,
) -> ImpactResult | None:
    """Assets reachable from ``root_asset_id`` by walking only *propagating*
    relationship types, in the direction failure would actually travel. A
    cycle (A depends_on B, B depends_on C, C depends_on A) terminates
    naturally: a node already in ``visited`` is never re-expanded."""
    root = db.get(Asset, root_asset_id)
    if root is None or root.deleted_at is not None:
        return None

    max_depth = max(0, min(max_depth, MAX_DEPTH))
    node_cap = max(1, min(node_cap, MAX_NODE_CAP))

    visited: dict[uuid.UUID, tuple[int, list[uuid.UUID]]] = {root.id: (0, [root.id])}
    assets: dict[uuid.UUID, Asset] = {root.id: root}
    frontier: set[uuid.UUID] = {root.id}
    truncated = False

    for depth in range(1, max_depth + 1):
        if not frontier or len(visited) >= node_cap:
            break
        rows = _impact_neighbor_edges(db, frontier)
        next_frontier: set[uuid.UUID] = set()
        for rel, source, target in rows:
            meta = RELATIONSHIP_TYPE_CATALOG[rel.relationship_type]
            impacted: Asset | None = None
            anchor: Asset | None = None
            if meta.impact_direction == "reverse" and target.id in frontier:
                impacted, anchor = source, target
            elif meta.impact_direction == "forward" and source.id in frontier:
                impacted, anchor = target, source
            if impacted is None or anchor is None or impacted.id in visited:
                continue
            if len(visited) >= node_cap:
                truncated = True
                continue
            parent_depth, parent_path = visited[anchor.id]
            visited[impacted.id] = (depth, [*parent_path, impacted.id])
            assets[impacted.id] = impacted
            next_frontier.add(impacted.id)
        frontier = next_frontier

    affected = [
        ImpactedNode(asset=assets[aid], distance=d, path=path)
        for aid, (d, path) in visited.items()
        if aid != root.id
    ]
    affected.sort(key=lambda x: (x.distance, x.asset.name))
    return ImpactResult(root=root, affected=affected, max_depth=max_depth, truncated=truncated)


def find_path(
    db: Session,
    *,
    source_asset_id: uuid.UUID,
    target_asset_id: uuid.UUID,
    max_depth: int = MAX_DEPTH,
) -> PathResult | None:
    """Shortest path (fewest hops, either direction) between two live Assets,
    bounded to ``max_depth`` hops. ``None`` if either Asset is missing/trashed;
    ``PathResult(found=False)`` if both exist but no bounded path connects them."""
    src = db.get(Asset, source_asset_id)
    tgt = db.get(Asset, target_asset_id)
    if src is None or src.deleted_at is not None or tgt is None or tgt.deleted_at is not None:
        return None
    if source_asset_id == target_asset_id:
        return PathResult(found=True, nodes=[src], edges=[])

    max_depth = max(0, min(max_depth, MAX_DEPTH))
    parent: dict[uuid.UUID, tuple[uuid.UUID, AssetRelationship]] = {}
    visited: set[uuid.UUID] = {src.id}
    frontier: set[uuid.UUID] = {src.id}
    found = False

    for _hop in range(max_depth):
        if not frontier or found:
            break
        rows = _neighbor_edges(db, frontier, "both", ())
        next_frontier: set[uuid.UUID] = set()
        for rel, source, target in rows:
            for a, b in ((source, target), (target, source)):
                if a.id in frontier and b.id not in visited:
                    visited.add(b.id)
                    parent[b.id] = (a.id, rel)
                    next_frontier.add(b.id)
                    if b.id == target_asset_id:
                        found = True
        frontier = next_frontier

    if target_asset_id not in visited:
        return PathResult(found=False)

    chain_ids: list[uuid.UUID] = [target_asset_id]
    chain_edges: list[AssetRelationship] = []
    cur = target_asset_id
    while cur != source_asset_id:
        prev_id, edge = parent[cur]
        chain_edges.append(edge)
        chain_ids.append(prev_id)
        cur = prev_id
    chain_ids.reverse()
    chain_edges.reverse()

    asset_rows = db.execute(select(Asset).where(Asset.id.in_(chain_ids))).scalars().all()
    by_id = {a.id: a for a in asset_rows}
    nodes = [by_id[aid] for aid in chain_ids]
    return PathResult(found=True, nodes=nodes, edges=chain_edges)
