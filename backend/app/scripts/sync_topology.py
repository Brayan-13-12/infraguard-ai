"""Full Neo4j topology rebuild from canonical PostgreSQL data.

    python -m app.scripts.sync_topology
    docker compose run --rm sync-topology

Safe to run repeatedly (idempotent upsert + prune of stale InfraGuard-managed
nodes/edges only - see ``app/services/graph/sync.py``). A no-op that exits
``0`` when ``NEO4J_URI`` is not configured - InfraGuard never requires Neo4j
to be usable.
"""

from __future__ import annotations

from app.db.session import SessionLocal
from app.services.graph import client, sync


def main() -> int:
    if not client.configured():
        print(
            "sync-topology: NEO4J_URI is not configured - nothing to sync. "
            "Asset relationships remain fully usable from PostgreSQL alone."
        )
        return 0

    with SessionLocal() as db:
        result = sync.full_rebuild(db)

    print(
        "sync-topology: full rebuild complete\n"
        f"  assets upserted:        {result['nodes']}\n"
        f"  relationships upserted: {result['edges']}\n"
        f"  stale nodes removed:    {result['removed_nodes']}\n"
        f"  stale edges removed:    {result['removed_edges']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
