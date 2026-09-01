"""Auth / session responses must be no-store (incl. error responses)."""

from __future__ import annotations


def _assert_no_store(resp) -> None:
    assert resp.headers.get("cache-control") == "no-store"
    assert resp.headers.get("pragma") == "no-cache"


def test_me_unauthenticated_401_is_no_store(client_factory) -> None:
    resp = client_factory().get("/api/v1/auth/me")
    assert resp.status_code == 401
    _assert_no_store(resp)


def test_login_invalid_body_422_is_no_store(client_factory) -> None:
    resp = client_factory().post("/api/v1/auth/login", json={"email": "x"})
    assert resp.status_code == 422
    _assert_no_store(resp)


def test_logout_is_no_store(client_factory) -> None:
    resp = client_factory().post("/api/v1/auth/logout")
    assert resp.status_code == 200
    _assert_no_store(resp)


def test_cross_origin_login_403_is_no_store(client_factory) -> None:
    resp = client_factory().post(
        "/api/v1/auth/login",
        json={"email": "a@b.com", "password": "a-valid-passphrase"},
        headers={"Origin": "https://evil.example"},
    )
    assert resp.status_code == 403
    _assert_no_store(resp)


def test_health_endpoints_are_not_forced_no_store(client_factory) -> None:
    # The no-store rule is scoped to /api/v1/auth only.
    resp = client_factory().get("/api/v1/health/live")
    assert resp.status_code == 200
    assert resp.headers.get("cache-control") != "no-store"
