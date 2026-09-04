"""Request/response schemas for the Topology API (bounded graph queries).

Shared by both traversal engines (PostgreSQL recursive CTE and, when
configured and reachable, Neo4j - see ``app/services/topology.py``) so the
route layer and the frontend never need to know which one actually answered.
"""

from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.relationship import AssetSummaryRead

Direction = Literal["both", "upstream", "downstream"]

MAX_DEPTH = 3
DEFAULT_DEPTH = 1
MAX_NODES = 500
DEFAULT_NODE_CAP = 200


class TopologyNode(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    asset_type: str
    environment: str
    criticality: str
    status: str
    is_active: bool
    #: True for the node the query was rooted at.
    is_root: bool = False


class TopologyEdge(BaseModel):
    id: uuid.UUID
    source_asset_id: uuid.UUID
    target_asset_id: uuid.UUID
    relationship_type: str


class SubgraphResponse(BaseModel):
    root_asset_id: uuid.UUID
    nodes: list[TopologyNode]
    edges: list[TopologyEdge]
    depth: int = Field(ge=0, le=MAX_DEPTH)
    direction: Direction
    #: True when the node cap was hit and the result is a partial view.
    truncated: bool
    #: Which engine actually answered - "postgres" or "neo4j". Never exposed as
    #: a claim of Neo4j being canonical; purely diagnostic for the UI.
    source: Literal["postgres", "neo4j"]


class ImpactedAsset(BaseModel):
    asset: AssetSummaryRead
    #: Hop count from the root along propagating relationship types.
    distance: int = Field(ge=1)
    #: Ordered asset ids from the root to this asset (inclusive of both ends).
    path: list[uuid.UUID]


class ImpactResponse(BaseModel):
    root_asset_id: uuid.UUID
    affected_assets: list[ImpactedAsset]
    max_depth: int = Field(ge=0, le=MAX_DEPTH)
    truncated: bool
    source: Literal["postgres", "neo4j"]


class PathResponse(BaseModel):
    source_asset_id: uuid.UUID
    target_asset_id: uuid.UUID
    found: bool
    #: Ordered nodes from source to target (empty when not found).
    nodes: list[TopologyNode]
    edges: list[TopologyEdge]
    length: int = Field(ge=0)
    source_engine: Literal["postgres", "neo4j"]


class GraphHealth(BaseModel):
    """Neo4j status for the system-health surface. Never fails the overall
    platform health - see ``app/services/health.py``."""

    configured: bool
    status: Literal["operational", "unavailable", "not_configured"]
    #: Best-effort node/edge counts from the last successful check, if any.
    detail: str | None = None
