"""Create (or promote) the bootstrap Administrator.

    python -m app.scripts.bootstrap_admin

Reads ``BOOTSTRAP_ADMIN_EMAIL`` / ``BOOTSTRAP_ADMIN_PASSWORD`` from the
environment (or ``.env``). Idempotent: safe to run repeatedly - it never resets
an existing account's password and never creates a second Administrator by
accident. The password is validated against the app's policy and is **never
printed or logged**.

Exit codes: ``0`` success, ``1`` misconfiguration (missing / weak credentials),
``2`` unexpected error.
"""

from __future__ import annotations

import sys

from app.core.config import settings
from app.db.session import SessionLocal
from app.services.bootstrap import BootstrapError, ensure_bootstrap_admin


def main() -> int:
    try:
        with SessionLocal() as db:
            result = ensure_bootstrap_admin(
                db,
                email=settings.BOOTSTRAP_ADMIN_EMAIL,
                password=settings.BOOTSTRAP_ADMIN_PASSWORD,
            )
            db.commit()
    except BootstrapError as exc:
        print(f"bootstrap-admin: {exc}", file=sys.stderr)
        print(
            "Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (see .env.example).",
            file=sys.stderr,
        )
        return 1
    except Exception as exc:  # pragma: no cover - defensive
        print(f"bootstrap-admin: unexpected error: {exc!r}", file=sys.stderr)
        return 2

    action = (
        "created"
        if result.created
        else "promoted"
        if result.promoted
        else "reactivated"
        if result.activated
        else "already an active Administrator"
    )
    print(
        f"bootstrap-admin: {result.email} - {action} "
        f"(status={result.account_status}, role=administrator)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
