"""Backend-only Neo4j driver wrapper - the single place that imports ``neo4j``
or touches its credentials. No Cypher, driver object or credential ever
crosses the API boundary to the frontend (§0/§39).

Every query goes through :func:`run`, which always uses parameters - never
string-interpolates a caller-supplied value into Cypher. The one thing that IS
interpolated is a relationship *type* name, and only from the fixed,
code-owned allow-list in ``app/services/graph/sync.py`` - never from
unvalidated input (§42/§48).
"""

from __future__ import annotations

import logging
from collections.abc import Iterator
from contextlib import contextmanager
from functools import lru_cache
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)


class GraphUnavailable(Exception):
    """Neo4j is not configured, or a call to it failed. Callers treat this as
    recoverable - it must never fail a PostgreSQL mutation (§44)."""


def configured() -> bool:
    return bool(settings.NEO4J_URI)


def _build_driver() -> Any:
    import neo4j  # imported lazily - keeps this an optional runtime dependency

    return neo4j.GraphDatabase.driver(
        settings.NEO4J_URI,
        auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD or ""),
    )


@lru_cache(maxsize=1)
def _cached_driver() -> Any:
    return _build_driver()


def reset_driver_cache() -> None:
    """Test helper - drop the cached driver so a later call rebuilds it (e.g.
    after monkeypatching settings)."""
    _cached_driver.cache_clear()


@contextmanager
def _session() -> Iterator[Any]:
    if not configured():
        raise GraphUnavailable("NEO4J_URI is not configured")
    driver = _cached_driver()
    session = driver.session(database=settings.NEO4J_DATABASE)
    try:
        yield session
    finally:
        session.close()


def run(query: str, **params: Any) -> list[dict[str, Any]]:
    """Execute one parameterized Cypher statement and return the rows as
    plain dicts. Raises :class:`GraphUnavailable` on any failure - callers
    decide whether that is fatal (it never is for a PostgreSQL mutation)."""
    try:
        with _session() as session:
            result = session.run(query, params, timeout=settings.NEO4J_TIMEOUT_SECONDS)
            return [dict(record) for record in result]
    except GraphUnavailable:
        raise
    except Exception as exc:  # noqa: BLE001 - any driver failure becomes GraphUnavailable
        raise GraphUnavailable(str(exc)) from exc


def check_health() -> tuple[str, str | None]:
    """``(status, detail)`` where status is ``"operational"`` /
    ``"unavailable"`` / ``"not_configured"``. Never raises."""
    if not configured():
        return "not_configured", None
    try:
        rows = run("RETURN 1 AS ok")
        if rows and rows[0].get("ok") == 1:
            return "operational", None
        return "unavailable", "unexpected response"
    except GraphUnavailable as exc:
        logger.warning("Neo4j health check failed: %s", exc)
        return "unavailable", str(exc)[:200]
