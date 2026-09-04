"""Bounded topology query endpoints (Asset Relationships & Topology milestone).

* ``GET /api/v1/topology/subgraph``            - bounded neighborhood of one Asset
* ``GET /api/v1/topology/assets/{id}/impact``  - downstream impact traversal
* ``GET /api/v1/topology/path``                - shortest bounded path between two Assets

Every query is answered from the canonical PostgreSQL relationship graph
(``app/services/topology.py``) - there is no dependency on Neo4j being
configured or reachable. Authorization requires **both**
``relationships.read`` and ``assets.read`` (§49): topology is a view over
Asset data, so either permission alone is insufficient.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from fastapi.exceptions import HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_permission
from app.db.session import get_db
from app.models.relationship import RelationshipType
from app.schemas.relationship import AssetSummaryRead, MessageResponse
from app.schemas.topology import (
    DEFAULT_DEPTH,
    DEFAULT_NODE_CAP,
    MAX_DEPTH,
    MAX_NODES,
    Direction,
    GraphHealth,
    ImpactedAsset,
    ImpactResponse,
    PathResponse,
    SubgraphResponse,
    TopologyEdge,
    TopologyNode,
)
from app.services import topology as topology_service
from app.services.graph import client as graph_client

router = APIRouter(
    prefix="/topology",
    tags=["topology"],
    dependencies=[
        Depends(get_current_user),
        Depends(require_permission("relationships.read")),
        Depends(require_permission("assets.read")),
    ],
)

_ASSET_NOT_FOUND = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail="Asset not found, or currently in Trash",
)


def _node(asset, *, is_root: bool) -> TopologyNode:
    return TopologyNode(
        id=asset.id,
        name=asset.name,
        asset_type=asset.asset_type,
        environment=asset.environment,
        criticality=asset.criticality,
        status=asset.status,
        is_active=asset.is_active,
        is_root=is_root,
    )


def _edge(rel) -> TopologyEdge:
    return TopologyEdge(
        id=rel.id,
        source_asset_id=rel.source_asset_id,
        target_asset_id=rel.target_asset_id,
        relationship_type=rel.relationship_type,
    )


@router.get(
    "/health",
    response_model=GraphHealth,
    summary="Neo4j graph projection status (never fails the platform's own health)",
)
def graph_health_endpoint() -> GraphHealth:
    status_value, detail = graph_client.check_health()
    return GraphHealth(configured=graph_client.configured(), status=status_value, detail=detail)


@router.get(
    "/subgraph", response_model=SubgraphResponse, summary="Bounded neighborhood of an Asset"
)
def subgraph_endpoint(
    db: Session = Depends(get_db),
    root_asset_id: uuid.UUID = Query(...),
    depth: int = Query(DEFAULT_DEPTH, ge=0, le=MAX_DEPTH),
    direction: Direction = Query("both"),
    relationship_type: list[RelationshipType] | None = Query(None, description="Repeatable"),
    environment: str | None = Query(None),
    criticality: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    node_cap: int = Query(DEFAULT_NODE_CAP, ge=1, le=MAX_NODES),
) -> SubgraphResponse:
    result = topology_service.get_subgraph(
        db,
        root_asset_id=root_asset_id,
        depth=depth,
        direction=direction,
        relationship_types=tuple(t.value for t in (relationship_type or ())),
        environment=environment,
        criticality=criticality,
        status=status_filter,
        node_cap=node_cap,
    )
    if result is None:
        raise _ASSET_NOT_FOUND
    return SubgraphResponse(
        root_asset_id=root_asset_id,
        nodes=[_node(a, is_root=(a.id == root_asset_id)) for a in result.nodes],
        edges=[_edge(e) for e in result.edges],
        depth=result.depth,
        direction=result.direction,
        truncated=result.truncated,
        source="postgres",
    )


@router.get(
    "/assets/{asset_id}/impact",
    response_model=ImpactResponse,
    summary="Downstream impact if this Asset fails",
    responses={404: {"model": MessageResponse}},
)
def impact_endpoint(
    asset_id: uuid.UUID,
    db: Session = Depends(get_db),
    max_depth: int = Query(MAX_DEPTH, ge=0, le=MAX_DEPTH),
    node_cap: int = Query(DEFAULT_NODE_CAP, ge=1, le=MAX_NODES),
) -> ImpactResponse:
    result = topology_service.compute_impact(
        db, root_asset_id=asset_id, max_depth=max_depth, node_cap=node_cap
    )
    if result is None:
        raise _ASSET_NOT_FOUND
    return ImpactResponse(
        root_asset_id=asset_id,
        affected_assets=[
            ImpactedAsset(
                asset=AssetSummaryRead.model_validate(item.asset),
                distance=item.distance,
                path=item.path,
            )
            for item in result.affected
        ],
        max_depth=result.max_depth,
        truncated=result.truncated,
        source="postgres",
    )


@router.get(
    "/path", response_model=PathResponse, summary="Shortest bounded path between two Assets"
)
def path_endpoint(
    db: Session = Depends(get_db),
    source_asset_id: uuid.UUID = Query(...),
    target_asset_id: uuid.UUID = Query(...),
    max_depth: int = Query(MAX_DEPTH, ge=1, le=MAX_DEPTH),
) -> PathResponse:
    result = topology_service.find_path(
        db,
        source_asset_id=source_asset_id,
        target_asset_id=target_asset_id,
        max_depth=max_depth,
    )
    if result is None:
        raise _ASSET_NOT_FOUND
    return PathResponse(
        source_asset_id=source_asset_id,
        target_asset_id=target_asset_id,
        found=result.found,
        nodes=[_node(a, is_root=(a.id == source_asset_id)) for a in result.nodes],
        edges=[_edge(e) for e in result.edges],
        length=len(result.edges),
        source_engine="postgres",
    )
