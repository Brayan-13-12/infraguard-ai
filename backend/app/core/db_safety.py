"""Fail-closed authorization for **destructive** database operations.

Some tooling in this repo drops / recreates schema or runs
``upgrade``/``downgrade`` cycles (the integration suite, migration validation).
Those operations must never touch the developer's persistent development volume
(``infraguard-ai_pgdata``).

Two independent conditions must **both** hold for a destructive operation to be
allowed - a naming convention alone is not enough:

1. ``INFRAGUARD_DISPOSABLE_DB`` is set to a truthy value (``1`` / ``true`` /
   ``yes`` / ``on``), i.e. the operator has explicitly declared the target
   throwaway; and
2. the target database name is clearly disposable - exactly ``test`` or ending
   in ``_test`` (e.g. ``infraguard_test``, ``infraguard_migration_test``).

Anything else raises :class:`DestructiveOperationRefused`. There is no override
flag and no "force": if you need to run a destructive operation, point it at a
disposable database and mark the environment.
"""

from __future__ import annotations

import os

from sqlalchemy.engine import make_url

#: Names we accept as "obviously a throwaway database".
_DISPOSABLE_SUFFIX = "_test"
_DISPOSABLE_EXACT = {"test"}

_TRUTHY = {"1", "true", "yes", "on"}


class DestructiveOperationRefused(RuntimeError):
    """Raised when a destructive DB operation is attempted without both the
    ``INFRAGUARD_DISPOSABLE_DB`` opt-in and a disposable target name."""


def disposable_opt_in() -> bool:
    """True when ``INFRAGUARD_DISPOSABLE_DB`` explicitly authorizes throwaway use."""
    return os.environ.get("INFRAGUARD_DISPOSABLE_DB", "").strip().lower() in _TRUTHY


def database_name(url: str) -> str:
    try:
        return (make_url(url).database or "").strip()
    except Exception:  # noqa: BLE001 - surface as "not disposable"
        return ""


def is_disposable_name(name: str) -> bool:
    n = name.strip().lower()
    return n in _DISPOSABLE_EXACT or n.endswith(_DISPOSABLE_SUFFIX)


def require_disposable_database(url: str, *, operation: str) -> str:
    """Return the database name if ``url`` may be used destructively, else raise.

    ``operation`` is a short human label used only in the error message
    (e.g. ``"integration test schema reset"``).
    """
    name = database_name(url)
    opted_in = disposable_opt_in()
    disposable = is_disposable_name(name)

    if opted_in and disposable:
        return name

    reasons: list[str] = []
    if not opted_in:
        reasons.append(
            "INFRAGUARD_DISPOSABLE_DB is not set to a truthy value (1/true/yes/on)"
        )
    if not disposable:
        reasons.append(
            f"target database {name or '<unknown>'!r} is not clearly disposable "
            "(its name must be 'test' or end with '_test')"
        )
    raise DestructiveOperationRefused(
        f"Refusing {operation}: " + "; and ".join(reasons) + ". "
        "Point it at a disposable database (e.g. the `db-test` compose service / "
        "infraguard_test) and export INFRAGUARD_DISPOSABLE_DB=1. "
        "NEVER run this against the main development database or its volume "
        "infraguard-ai_pgdata."
    )
