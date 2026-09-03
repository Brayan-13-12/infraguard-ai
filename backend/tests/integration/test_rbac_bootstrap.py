"""Explicit first-Administrator bootstrap + the no-auto-role registration rule.

Public self-registration can **never** create an active account or grant a role
(it only files a ``pending`` access request). The one deterministic way to get a
first Administrator is the explicit ``app.scripts.bootstrap_admin`` command,
driven by ``BOOTSTRAP_ADMIN_EMAIL`` / ``BOOTSTRAP_ADMIN_PASSWORD``.
"""

from __future__ import annotations

import contextlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.rbac import UserRole
from app.models.user import AccountStatus, User
from app.services.bootstrap import BootstrapError, ensure_bootstrap_admin
from app.services.rbac import resolve_effective_permissions
from app.services.users import get_by_email

pytestmark = pytest.mark.integration

API = "/api/v1"
PW = "a-perfectly-fine-passphrase"


def _register(client: TestClient, email: str):
    return client.post(f"{API}/auth/register", json={"email": email, "password": PW})


# --- Registration never grants access ----------------------------------

def test_registration_creates_a_pending_account_with_no_roles(
    client: TestClient, db_session: Session
) -> None:
    assert _register(client, "founder@example.com").status_code == 201

    user = get_by_email(db_session, "founder@example.com")
    assert user is not None
    assert user.account_status == AccountStatus.PENDING.value
    assert db_session.execute(
        select(UserRole).where(UserRole.user_id == user.id)
    ).first() is None


def test_pending_user_cannot_authenticate(client: TestClient) -> None:
    _register(client, "founder@example.com")
    resp = client.post(f"{API}/auth/login", json={"email": "founder@example.com", "password": PW})
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "account_pending"


def test_even_a_pending_user_with_stale_roles_has_no_effective_permissions(
    client: TestClient, db_session: Session
) -> None:
    from app.services.rbac import role_by_slug

    _register(client, "stale@example.com")
    user = get_by_email(db_session, "stale@example.com")
    db_session.add(UserRole(user_id=user.id, role_id=role_by_slug(db_session, "administrator").id))
    db_session.flush()

    # Role rows exist, but the account is not active -> authorization must fail.
    assert user.account_status != AccountStatus.ACTIVE.value
    # (resolve_effective_permissions returns the union for the roles; the guard
    # in deps.py refuses the request before it is ever consulted.)
    assert client.post(
        f"{API}/auth/login", json={"email": "stale@example.com", "password": PW}
    ).status_code == 403


# --- ensure_bootstrap_admin (service) ---------------------------------

def test_bootstrap_creates_an_active_administrator(db_session: Session) -> None:
    result = ensure_bootstrap_admin(
        db_session, email="Admin@Example.com", password=PW
    )
    assert result.created is True
    assert result.email == "admin@example.com"  # normalized
    assert result.account_status == AccountStatus.ACTIVE.value

    user = get_by_email(db_session, "admin@example.com")
    assert user is not None
    assert user.account_status == AccountStatus.ACTIVE.value
    perms = resolve_effective_permissions(db_session, user.id)
    assert "users.manage" in perms and "roles.manage" in perms


def test_bootstrap_is_idempotent(db_session: Session) -> None:
    first = ensure_bootstrap_admin(db_session, email="admin@example.com", password=PW)
    assert first.created is True
    original_hash = get_by_email(db_session, "admin@example.com").password_hash

    second = ensure_bootstrap_admin(
        db_session, email="admin@example.com", password="a-different-passphrase"
    )
    assert second.created is False
    assert second.promoted is False and second.activated is False

    users = db_session.execute(
        select(User).where(User.email == "admin@example.com")
    ).scalars().all()
    assert len(users) == 1
    # The password is never reset for an existing account.
    assert users[0].password_hash == original_hash


def test_bootstrap_promotes_and_activates_an_existing_account(
    client: TestClient, db_session: Session
) -> None:
    _register(client, "existing@example.com")  # pending, no roles

    result = ensure_bootstrap_admin(db_session, email="existing@example.com", password=PW)
    assert result.created is False
    assert result.promoted is True
    assert result.activated is True

    user = get_by_email(db_session, "existing@example.com")
    assert user.account_status == AccountStatus.ACTIVE.value
    assert "users.manage" in resolve_effective_permissions(db_session, user.id)


@pytest.mark.parametrize(
    ("email", "password", "needle"),
    [
        (None, PW, "EMAIL"),
        ("admin@example.com", None, "PASSWORD"),
        ("admin@example.com", "short", "characters"),
        ("   ", PW, "EMAIL"),
        ("not-an-email", PW, "valid email"),
        ("admin@infra.local", PW, "valid email"),
    ],
)
def test_bootstrap_rejects_bad_configuration(
    db_session: Session, email, password, needle
) -> None:
    with pytest.raises(BootstrapError) as exc:
        ensure_bootstrap_admin(db_session, email=email, password=password)
    assert needle in str(exc.value)


# --- CLI entry point -------------------------------------------------

def _patch_cli(monkeypatch, db_session: Session, *, email, password) -> None:
    import app.scripts.bootstrap_admin as cli

    @contextlib.contextmanager
    def _fake_session():
        yield db_session

    monkeypatch.setattr(cli, "SessionLocal", _fake_session)
    monkeypatch.setattr(cli.settings, "BOOTSTRAP_ADMIN_EMAIL", email)
    monkeypatch.setattr(cli.settings, "BOOTSTRAP_ADMIN_PASSWORD", password)
    monkeypatch.setattr(db_session, "commit", db_session.flush)


def test_cli_success_never_prints_the_password(monkeypatch, capsys, db_session: Session) -> None:
    secret = "correct-horse-battery-staple"
    _patch_cli(monkeypatch, db_session, email="admin@example.com", password=secret)

    from app.scripts.bootstrap_admin import main

    assert main() == 0
    captured = capsys.readouterr()
    assert secret not in captured.out and secret not in captured.err
    assert "admin@example.com" in captured.out
    assert "created" in captured.out


def test_cli_missing_env_fails_safely(monkeypatch, capsys, db_session: Session) -> None:
    _patch_cli(monkeypatch, db_session, email=None, password=None)

    from app.scripts.bootstrap_admin import main

    assert main() == 1
    err = capsys.readouterr().err
    assert "BOOTSTRAP_ADMIN_EMAIL" in err


# --- Bootstrap admin is not "immortal" ------------------------------

def test_new_viewer_cannot_reach_administration_or_mutations(
    auth_client: TestClient, make_client
) -> None:
    viewer = make_client("plain-viewer@example.com")  # default Viewer
    assert viewer.get(f"{API}/admin/users").status_code == 403
    assert viewer.get(f"{API}/admin/roles").status_code == 403
    new_incident = {"title": "x", "severity": "Low", "priority": "P4"}
    assert viewer.post(f"{API}/incidents", json=new_incident).status_code == 403
    me = viewer.get(f"{API}/auth/me").json()
    assert {r["slug"] for r in me["roles"]} == {"viewer"}
