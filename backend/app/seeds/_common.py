"""Shared primitives for the demo seed: the stable id namespace, deterministic
clocks and small helpers. No database access here.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

#: All demo rows get a **deterministic** primary key derived from this namespace
#: plus a stable per-record key. Re-running the seed therefore targets the exact
#: same rows (idempotency) and can never collide with a user-created record
#: (those get a random uuid4). Renaming a seeded record and re-seeding will
#: re-create it under the original key - documented caveat.
SEED_NAMESPACE = uuid.UUID("5eed0000-1f9a-4d21-9c3a-000000000000")

#: Marker used on the seed-specific audit context so demo events are traceable.
SEED_REQUEST_PREFIX = "seed-demo"
SEED_USER_AGENT = "app.scripts.seed_demo"


class SeedError(RuntimeError):
    """A recoverable, developer-facing failure (e.g. no Administrator present)."""


def seed_uuid(kind: str, key: str) -> uuid.UUID:
    """Stable id for a demo record. ``kind`` namespaces record types
    (``"asset"`` / ``"incident"`` / ``"user"``)."""
    return uuid.uuid5(SEED_NAMESPACE, f"{kind}:{key}")


def _stable_offset(key: str, modulo: int) -> int:
    """Deterministic 0..modulo-1 derived from ``key`` (stable across runs)."""
    return int(uuid.uuid5(SEED_NAMESPACE, f"jitter:{key}").int % modulo)


def days_ago(now: datetime, days: float, *, key: str = "", spread_hours: int = 20) -> datetime:
    """``now`` minus ``days`` days, minus a deterministic sub-day offset so
    records created "N days ago" don't all share a timestamp."""
    base = now - timedelta(days=days)
    if key:
        base -= timedelta(
            hours=_stable_offset(key, spread_hours),
            minutes=_stable_offset(key + "m", 60),
            seconds=_stable_offset(key + "s", 60),
        )
    return base


def monotonic_clock(start: datetime) -> Iterator[datetime]:
    """Yields strictly increasing timestamps from ``start`` (7s steps + jitter),
    for ordering several events written in one logical operation."""
    n = 0
    while True:
        yield start + timedelta(seconds=n * 7 + (n % 3))
        n += 1


def utcnow() -> datetime:
    return datetime.now(UTC)
