"""Safety guard for the integration test database.

Integration tests run **destructive** schema operations (``drop_all`` /
``create_all``). They must therefore only ever point at a disposable, clearly
test-only database, and a *configured* run must never be silently skipped.

Safety rule
-----------
The integration suite runs only when **both** hold (a naming convention alone is
not trusted):

1. ``INFRAGUARD_DISPOSABLE_DB`` is set truthy (``1`` / ``true`` / ``yes`` /
   ``on``) - the operator has explicitly declared the target throwaway; and
2. the ``TEST_DATABASE_URL`` database name is exactly ``test`` or ends with
   ``_test`` (case-insensitive), and is not the app's own ``DATABASE_URL``.

Anything else - a bare ``infraguard``, ``postgres``, a production URL, an empty
name, or the opt-in missing - is rejected and the integration suite fails fast.
Use the disposable ``db-test`` Compose service::

    docker compose --profile test up -d db-test
    export INFRAGUARD_DISPOSABLE_DB=1
    export TEST_DATABASE_URL=postgresql+psycopg://infraguard:infraguard_test_only@localhost:55433/infraguard_test

Skip vs. fail
-------------
* ``TEST_DATABASE_URL`` absent  -> integration tests skip.
* ``TEST_DATABASE_URL`` set but unsafe or unreachable -> the suite **fails**.
"""

from __future__ import annotations

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError

from app.core.db_safety import disposable_opt_in


class UnsafeTestDatabase(RuntimeError):
    """Raised when TEST_DATABASE_URL does not clearly identify a test database."""


class UnreachableTestDatabase(RuntimeError):
    """Raised when a configured TEST_DATABASE_URL cannot be connected to."""


def _is_test_database_name(name: str) -> bool:
    n = name.strip().lower()
    return n == "test" or n.endswith("_test")


def assert_test_database(url: str, *, app_database_url: str | None = None) -> str:
    """Return the database name if ``url`` is a safe test target, else raise.

    * The database name must be ``test`` or end with ``_test``.
    * It must not be the application's own configured ``DATABASE_URL``.
    """
    try:
        parsed = make_url(url)
    except Exception as exc:  # noqa: BLE001 - surface as a guard failure
        raise UnsafeTestDatabase(f"TEST_DATABASE_URL is not a valid URL: {exc}") from exc

    if not disposable_opt_in():
        raise UnsafeTestDatabase(
            "refusing to run destructive integration tests: set "
            "INFRAGUARD_DISPOSABLE_DB=1 to confirm TEST_DATABASE_URL points at a "
            "throwaway database (never the main development database)."
        )

    name = parsed.database or ""
    if not _is_test_database_name(name):
        raise UnsafeTestDatabase(
            f"refusing to run destructive integration tests against database {name!r}: "
            "its name must be 'test' or end with '_test'. "
            "Point TEST_DATABASE_URL at a disposable test database."
        )

    if app_database_url:
        try:
            app_name = make_url(app_database_url).database or ""
        except Exception:  # noqa: BLE001
            app_name = ""
        if app_name and app_name == name:
            raise UnsafeTestDatabase(
                "TEST_DATABASE_URL points at the application's own DATABASE_URL database "
                f"({name!r}); integration tests must use a separate test database."
            )

    return name


def verify_reachable(url: str, *, timeout_seconds: int = 3) -> None:
    """Raise :class:`UnreachableTestDatabase` if ``url`` cannot be connected to."""
    engine = create_engine(
        url,
        pool_pre_ping=False,
        future=True,
        connect_args={"connect_timeout": timeout_seconds},
    )
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise UnreachableTestDatabase(
            f"configured TEST_DATABASE_URL is unreachable: {exc.__class__.__name__}"
        ) from exc
    finally:
        engine.dispose()
