"""Neo4j graph projection (Asset Relationships & Topology milestone).

PostgreSQL (``app/models/relationship.py``) is the canonical source of truth
for Asset relationships. This package is a **derived, best-effort**
projection into Neo4j used for graph sync/health and future graph-native
querying - it is never on InfraGuard's critical path:

* :mod:`app.services.graph.client` - the only module that ever imports the
  ``neo4j`` driver or holds credentials. Backend-only; nothing here is ever
  reachable from the frontend.
* :mod:`app.services.graph.sync` - upsert/remove one node or edge (called
  best-effort after a PostgreSQL commit) and a full rebuild
  (``python -m app.scripts.sync_topology``).

If ``NEO4J_URI`` is unset, every function in this package is a safe no-op -
InfraGuard (including asset relationship CRUD and the topology API, which is
answered entirely from PostgreSQL - see ``app/services/topology.py``) works
identically with or without Neo4j configured.
"""
