"""Integration tests for the authentication API against a real PostgreSQL.

Registration is an **access request**: it creates a ``pending`` account with no
roles that cannot sign in until an administrator approves it. These tests
activate accounts directly on the test session (the equivalent of an approval)
where a usable session is needed.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.models.rbac import UserRole
from app.models.user import AccountStatus, User
from app.services.rbac import role_by_slug

pytestmark = pytest.mark.integration

REGISTER = "/api/v1/auth/register"
LOGIN = "/api/v1/auth/login"
LOGOUT = "/api/v1/auth/logout"
ME = "/api/v1/auth/me"

GOOD_EMAIL = "alice@example.com"
GOOD_PASSWORD = "a-perfectly-fine-passphrase"
COOKIE = "infraguard_access"


def _register(client: TestClient, email: str = GOOD_EMAIL, password: str = GOOD_PASSWORD):
    return client.post(REGISTER, json={"email": email, "password": password})


def _login(client: TestClient, email: str = GOOD_EMAIL, password: str = GOOD_PASSWORD):
    return client.post(LOGIN, json={"email": email, "password": password})


def _user(db: Session, email: str = GOOD_EMAIL) -> User:
    return db.execute(select(User).where(User.email == email)).scalar_one()


def _set_status(db: Session, email: str, status: AccountStatus) -> User:
    user = _user(db, email)
    user.account_status = status.value
    db.flush()
    return user


def _activate(db: Session, email: str = GOOD_EMAIL) -> User:
    """Approve: active + a Viewer role (so /me + protected reads work)."""
    user = _set_status(db, email, AccountStatus.ACTIVE)
    db.add(UserRole(user_id=user.id, role_id=role_by_slug(db, "viewer").id))
    db.flush()
    return user


# --- Registration = access request ---------------------------------

def test_register_creates_a_pending_request(client: TestClient, db_session: Session) -> None:
    resp = _register(client)
    assert resp.status_code == 201
    body = resp.json()
    assert body["account_status"] == "pending"
    assert "aprob" in body["detail"].lower() or "approve" in body["detail"].lower()
    assert "password" not in resp.text and "hash" not in resp.text

    user = _user(db_session)
    assert user.account_status == "pending"
    assert user.password_hash.startswith("$argon2id$")
    # no roles assigned by registration
    assert db_session.execute(
        select(UserRole).where(UserRole.user_id == user.id)
    ).first() is None


def test_register_response_never_contains_hash(client: TestClient) -> None:
    resp = _register(client)
    assert "password_hash" not in resp.text and "$argon2" not in resp.text


def test_register_invalid_email(client: TestClient) -> None:
    resp = client.post(REGISTER, json={"email": "nope", "password": GOOD_PASSWORD})
    assert resp.status_code == 422


def test_register_weak_password(client: TestClient) -> None:
    assert client.post(REGISTER, json={"email": GOOD_EMAIL, "password": "short"}).status_code == 422


# --- Duplicate / normalized email --------------------------------

def test_register_duplicate_email_is_status_neutral_409(client: TestClient) -> None:
    assert _register(client).status_code == 201
    resp = _register(client)
    assert resp.status_code == 409
    detail = resp.json()["detail"].lower()
    # Must not reveal the account's lifecycle state.
    for leak in ("pending", "active", "rejected", "disabled"):
        assert leak not in detail


@pytest.mark.parametrize(
    "variant", ["ALICE@example.com", "  Alice@Example.com  ", "aLiCe@EXAMPLE.COM"]
)
def test_register_case_and_whitespace_are_one_identity(
    client: TestClient, variant: str
) -> None:
    assert _register(client).status_code == 201
    assert _register(client, email=variant).status_code == 409


def test_db_uniqueness_holds_when_the_service_is_bypassed(
    client: TestClient, db_session: Session
) -> None:
    from sqlalchemy.exc import IntegrityError

    assert _register(client).status_code == 201
    db_session.add(User(email=GOOD_EMAIL, password_hash="x" * 20, account_status="pending"))
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()


# --- Login: lifecycle states ------------------------------------

def test_login_pending_returns_account_pending(client: TestClient) -> None:
    _register(client)
    resp = _login(client)
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "account_pending"
    assert COOKIE not in client.cookies


def test_login_rejected_returns_account_rejected(client: TestClient, db_session: Session) -> None:
    _register(client)
    _set_status(db_session, GOOD_EMAIL, AccountStatus.REJECTED)
    resp = _login(client)
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "account_rejected"


def test_login_disabled_returns_account_disabled(client: TestClient, db_session: Session) -> None:
    _register(client)
    _set_status(db_session, GOOD_EMAIL, AccountStatus.DISABLED)
    resp = _login(client)
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "account_disabled"


def test_login_wrong_password_is_generic_401_even_when_pending(client: TestClient) -> None:
    _register(client)
    resp = _login(client, password="wrong-password-here")
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid email or password"
    assert "pending" not in resp.text.lower()


def test_login_unknown_user_is_generic_401(client: TestClient) -> None:
    resp = _login(client, email="ghost@example.com")
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid email or password"


def test_login_active_sets_httponly_cookie(client: TestClient, db_session: Session) -> None:
    _register(client)
    _activate(db_session)
    resp = _login(client)
    assert resp.status_code == 200
    assert resp.json()["email"] == GOOD_EMAIL
    set_cookie = resp.headers["set-cookie"].lower()
    assert "httponly" in set_cookie
    assert "samesite=lax" in set_cookie
    assert "max-age=1800" in set_cookie
    assert COOKIE in client.cookies


# --- /me ------------------------------------------------------------

def test_me_with_cookie(client: TestClient, db_session: Session) -> None:
    _register(client)
    _activate(db_session)
    _login(client)
    resp = client.get(ME)
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == GOOD_EMAIL
    assert body["account_status"] == "active"


def test_me_with_bearer_header(client: TestClient, db_session: Session) -> None:
    _register(client)
    user = _activate(db_session)
    token, _ = create_access_token(subject=str(user.id))
    resp = client.get(ME, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


def test_me_without_auth_is_401(client: TestClient) -> None:
    assert client.get(ME).status_code == 401


def test_me_with_malformed_token_is_401(client: TestClient) -> None:
    client.cookies.set(COOKIE, "not-a-jwt")
    resp = client.get(ME)
    assert resp.status_code == 401
    assert "hash" not in resp.text and "secret" not in resp.text


def test_me_with_expired_token_is_401(client: TestClient, db_session: Session, monkeypatch) -> None:
    _register(client)
    user = _activate(db_session)
    monkeypatch.setattr("app.core.security.settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES", -1)
    token, _ = create_access_token(subject=str(user.id))
    client.cookies.set(COOKIE, token)
    assert client.get(ME).status_code == 401


def test_me_for_disabled_user_is_403_with_code(client: TestClient, db_session: Session) -> None:
    _register(client)
    _activate(db_session)
    _login(client)
    _set_status(db_session, GOOD_EMAIL, AccountStatus.DISABLED)
    resp = client.get(ME)
    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "account_disabled"


# --- Logout --------------------------------------------------------

def test_logout_clears_cookie(client: TestClient, db_session: Session) -> None:
    _register(client)
    _activate(db_session)
    _login(client)
    assert client.get(ME).status_code == 200

    resp = client.post(LOGOUT)
    assert resp.status_code == 200
    assert COOKIE not in client.cookies or not client.cookies.get(COOKIE)
    assert client.get(ME).status_code == 401


# --- CSRF / origin -------------------------------------------------

def test_state_changing_request_from_foreign_origin_is_blocked(client: TestClient) -> None:
    resp = client.post(
        LOGIN,
        json={"email": GOOD_EMAIL, "password": GOOD_PASSWORD},
        headers={"Origin": "https://evil.example"},
    )
    assert resp.status_code == 403


# --- Cache headers (no-store) --------------------------------------

def test_success_paths_are_no_store(client: TestClient, db_session: Session) -> None:
    assert _register(client).headers["cache-control"] == "no-store"
    _activate(db_session)
    assert _login(client).headers["cache-control"] == "no-store"
    assert client.get(ME).headers["cache-control"] == "no-store"
    out = client.post(LOGOUT)
    assert out.headers["cache-control"] == "no-store"
    assert out.headers.get("pragma") == "no-cache"


# --- Validation responses never reflect the submitted password ----

def test_register_422_never_reflects_the_password(client: TestClient) -> None:
    sentinel = "REG-SENTINEL-" + "z" * 200
    resp = client.post(REGISTER, json={"email": GOOD_EMAIL, "password": sentinel})
    assert resp.status_code == 422
    assert "REG-SENTINEL" not in resp.text
    assert '"input"' not in resp.text and '"ctx"' not in resp.text


def test_login_422_never_reflects_the_password(client: TestClient) -> None:
    sentinel = "LOGIN-SENTINEL-" + "y" * 200
    resp = client.post(LOGIN, json={"email": GOOD_EMAIL, "password": sentinel})
    assert resp.status_code == 422
    assert "LOGIN-SENTINEL" not in resp.text
    assert '"input"' not in resp.text and '"ctx"' not in resp.text


# --- Rate limiting ------------------------------------------------

def test_login_is_rate_limited(client: TestClient) -> None:
    _register(client)
    codes = [
        client.post(LOGIN, json={"email": GOOD_EMAIL, "password": "bad"}).status_code
        for _ in range(15)
    ]
    assert 429 in codes
    assert codes.count(401) <= 10


# --- Database unavailable ----------------------------------------

def test_login_when_database_down_is_generic_503(client: TestClient, monkeypatch) -> None:
    from sqlalchemy.exc import OperationalError

    def _boom(*_a, **_k):
        raise OperationalError("SELECT", {}, Exception("connection refused"))

    monkeypatch.setattr("app.api.v1.routes.auth.authenticate", _boom)
    resp = client.post(LOGIN, json={"email": GOOD_EMAIL, "password": GOOD_PASSWORD})
    assert resp.status_code == 503
    lowered = resp.text.lower()
    for marker in ("psycopg", "traceback", "operationalerror", "select", "connection refused"):
        assert marker not in lowered


# --- Full flow ----------------------------------------------------

def test_full_flow_request_approve_login_me_logout(client: TestClient, db_session: Session) -> None:
    assert _register(client, email="flow@example.com").status_code == 201
    assert _login(client, email="flow@example.com").status_code == 403  # pending
    _activate(db_session, "flow@example.com")
    assert _login(client, email="flow@example.com").status_code == 200
    me = client.get(ME)
    assert me.status_code == 200 and me.json()["email"] == "flow@example.com"
    assert client.post(LOGOUT).status_code == 200
    assert client.get(ME).status_code == 401
