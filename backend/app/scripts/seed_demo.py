"""Load the curated InfraGuard AI demo dataset.

    python -m app.scripts.seed_demo

Strictly **additive and idempotent**: it INSERTs missing demo assets, incidents,
timelines, audit events and a few pending access requests, and does nothing else.
It never drops / truncates / resets anything, never touches user-created records,
and never changes existing users, passwords, roles or audit history. Re-running
it creates no duplicates.

Regenerate demo data with THIS command - never by recreating PostgreSQL. It runs
against the normal development database (the one the backend uses) and does not
require any disposable-DB opt-in because it is non-destructive.

Requires an active Administrator (the audit actor). If none exists, run
``python -m app.scripts.bootstrap_admin`` first.

Exit codes: ``0`` success, ``1`` recoverable misconfiguration (no Administrator),
``2`` unexpected error.
"""

from __future__ import annotations

import sys

from app.db.session import SessionLocal
from app.seeds._common import SeedError
from app.seeds.runner import run_seed


def main() -> int:
    try:
        with SessionLocal() as db:
            summary = run_seed(db)
            db.commit()
    except SeedError as exc:
        print(f"seed-demo: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001 - surface, do not hide (see task §34)
        print(f"seed-demo: unexpected error: {exc!r}", file=sys.stderr)
        return 2

    print(summary.render())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
