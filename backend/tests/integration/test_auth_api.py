"""Integration tests for the authentication API against a real PostgreSQL."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.models.user import User

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


# --- Registration ----------------------------------------------------

def test_register_success(client: TestClient, db_session: Session) -> None:
    resp = _register(client)
    assert resp.status_code == 201
    body = resp.json()
    assert body["email"] == GOOD_EMAIL
    assert body["is_active"] is True
    assert set(body) == {"id", "email", "is_active", "created_at"}
    assert "password" not in resp.text and "hash" not in resp.text

    user = db_session.execute(select(User).where(User.email == GOOD_EMAIL)).scalar_one()
    assert user.password_hash.startswith("$argon2id$")
    assert user.password_hash != GOOD_PASSWORD


def test_register_duplicate_email_conflict(client: TestClient) -> None:
    assert _register(client).status_code == 201
    resp = _register(client, email="ALICE@example.com")  # case-insensitive dup
    assert resp.status_code == 409
    assert resp.json()["detail"] == "Email is already registered"


def test_register_invalid_email(client: TestClient) -> None:
    resp = client.post(REGISTER, json={"email": "nope", "password": GOOD_PASSWORD})
    assert resp.status_code == 422


def test_register_weak_password(client: TestClient) -> None:
    resp = client.post(REGISTER, json={"email": GOOD_EMAIL, "password": "short"})
    assert resp.status_code == 422


def test_register_response_never_contains_hash(client: TestClient) -> None:
    resp = _register(client)
    assert "password_hash" not in resp.text
    assert "$argon2" not in resp.text


# --- Login -----------------------------------------------------------

def test_login_success_sets_httponly_cookie(client: TestClient) -> None:
    _register(client)
    resp = _login(client)
    assert resp.status_code == 200
    assert resp.json()["email"] == GOOD_EMAIL

    set_cookie = resp.headers["set-cookie"].lower()
    assert "httponly" in set_cookie
    assert "samesite=lax" in set_cookie
    assert "path=/" in set_cookie
    # Cookie Max-Age is kept in lock-step with the JWT lifetime (30 min).
    assert "max-age=1800" in set_cookie
    assert COOKIE in client.cookies


def test_login_wrong_password_is_generic_401(client: TestClient) -> None:
    _register(client)
    resp = _login(client, password="wrong-password-here")
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid email or password"
    assert COOKIE not in client.cookies


def test_login_unknown_user_is_generic_401(client: TestClient) -> None:
    resp = _login(client, email="ghost@example.com")
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid email or password"


def test_login_inactive_user_is_generic_401(client: TestClient, db_session: Session) -> None:
    _register(client)
    user = db_session.execute(select(User).where(User.email == GOOD_EMAIL)).scalar_one()
    user.is_active = False
    db_session.flush()

    resp = _login(client)
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid email or password"


# --- /me ------------------------------------------------------------

def test_me_with_cookie(client: TestClient) -> None:
    _register(client)
    _login(client)
    resp = client.get(ME)
    assert resp.status_code == 200
    assert resp.json()["email"] == GOOD_EMAIL


def test_me_with_bearer_header(client: TestClient, db_session: Session) -> None:
    _register(client)
    user = db_session.execute(select(User).where(User.email == GOOD_EMAIL)).scalar_one()
    token, _ = create_access_token(subject=str(user.id))
    resp = client.get(ME, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


def test_me_without_auth_is_401(client: TestClient) -> None:
    resp = client.get(ME)
    assert resp.status_code == 401


def test_me_with_malformed_token_is_401(client: TestClient) -> None:
    client.cookies.set(COOKIE, "not-a-jwt")
    resp = client.get(ME)
    assert resp.status_code == 401
    assert "hash" not in resp.text and "secret" not in resp.text


def test_me_with_expired_token_is_401(client: TestClient, db_session: Session, monkeypatch) -> None:
    _register(client)
    user = db_session.execute(select(User).where(User.email == GOOD_EMAIL)).scalar_one()
    monkeypatch.setattr(
        "app.core.security.settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES", -1
    )
    token, _ = create_access_token(subject=str(user.id))
    client.cookies.set(COOKIE, token)
    resp = client.get(ME)
    assert resp.status_code == 401


def test_me_for_deactivated_user_is_403(client: TestClient, db_session: Session) -> None:
    _register(client)
    _login(client)
    user = db_session.execute(select(User).where(User.email == GOOD_EMAIL)).scalar_one()
    user.is_active = False
    db_session.flush()
    resp = client.get(ME)
    assert resp.status_code == 403


# --- Logout --------------------------------------------------------

def test_logout_clears_cookie(client: TestClient) -> None:
    _register(client)
    _login(client)
    assert client.get(ME).status_code == 200

    resp = client.post(LOGOUT)
    assert resp.status_code == 200
    # Cookie removed on the client, and /me now unauthorized.
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

def test_success_paths_are_no_store(client: TestClient) -> None:
    reg = _register(client)
    assert reg.headers["cache-control"] == "no-store"

    login = _login(client)
    assert login.headers["cache-control"] == "no-store"

    me = client.get(ME)
    assert me.headers["cache-control"] == "no-store"

    out = client.post(LOGOUT)
    assert out.headers["cache-control"] == "no-store"
    assert out.headers.get("pragma") == "no-cache"


# --- Validation responses never reflect the submitted password ----

def test_register_422_never_reflects_the_password(client: TestClient) -> None:
    sentinel = "REG-SENTINEL-" + "z" * 200  # overlong -> 422 before any hashing
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

def test_full_flow_register_login_me_logout(client: TestClient) -> None:
    assert _register(client, email="flow@example.com").status_code == 201
    assert _login(client, email="flow@example.com").status_code == 200
    me = client.get(ME)
    assert me.status_code == 200 and me.json()["email"] == "flow@example.com"
    assert client.post(LOGOUT).status_code == 200
    assert client.get(ME).status_code == 401
