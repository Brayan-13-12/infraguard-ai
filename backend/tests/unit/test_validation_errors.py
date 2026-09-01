"""Regression tests: the 422 validation handler must never reflect raw input.

Pydantic's default error body includes an ``input`` field (and ``ctx``) that
echoes the submitted value - for a password field that is the plaintext
password. Every request below uses a distinctive sentinel and asserts it does
**not** appear anywhere in the response body, and that the structural keys
``input`` / ``ctx`` are gone.
"""

from __future__ import annotations

from app.core.config import settings

REGISTER = "/api/v1/auth/register"
LOGIN = "/api/v1/auth/login"

_MIN = settings.PASSWORD_MIN_LENGTH
_MAX = settings.PASSWORD_MAX_LENGTH

SHORT_PW = "leakSHORT99"  # 11 chars < PASSWORD_MIN_LENGTH (12)
assert len(SHORT_PW) < _MIN
BLANK_PW = " " * (_MIN + 3)  # long enough to pass length, then fails "not blank"
EMPTY_PW = ""
OVERLONG_PW = "leak-overlong-" + "z" * (_MAX + 20)
LOGIN_OVERLONG_PW = "leak-login-overlong-" + "y" * (_MAX + 20)
NON_STRING_PW = 999_666_333  # int, not a string -> string_type error

_SENTINELS = ("leakSHORT99", "leak-overlong-", "leak-login-overlong-", "999666333", "zzzz", "yyyy")


def _assert_no_reflection(resp) -> None:
    assert resp.status_code == 422
    raw = resp.text
    lowered = raw.lower()

    # No raw-value carrying keys at all.
    assert '"input"' not in raw, raw
    assert '"ctx"' not in raw, raw

    # No sentinel substring anywhere in the body.
    for sentinel in _SENTINELS:
        assert sentinel.lower() not in lowered, f"{sentinel!r} reflected in {raw!r}"

    # Structure is still useful for the frontend: only safe keys, msg is a
    # generic string (Pydantic's length / type / "not blank" messages never
    # contain the submitted value).
    body = resp.json()
    assert isinstance(body["detail"], list) and body["detail"]
    for item in body["detail"]:
        assert set(item) <= {"type", "loc", "msg"}
        assert isinstance(item["msg"], str) and item["msg"]

    # And it is not cacheable.
    assert resp.headers.get("cache-control") == "no-store"


def test_register_short_password_not_reflected(client_factory) -> None:
    client = client_factory()
    _assert_no_reflection(client.post(REGISTER, json={"email": "a@b.com", "password": SHORT_PW}))


def test_register_blank_password_not_reflected(client_factory) -> None:
    client = client_factory()
    _assert_no_reflection(client.post(REGISTER, json={"email": "a@b.com", "password": BLANK_PW}))


def test_register_empty_password_not_reflected(client_factory) -> None:
    client = client_factory()
    _assert_no_reflection(client.post(REGISTER, json={"email": "a@b.com", "password": EMPTY_PW}))


def test_register_overlong_password_not_reflected(client_factory) -> None:
    client = client_factory()
    _assert_no_reflection(client.post(REGISTER, json={"email": "a@b.com", "password": OVERLONG_PW}))


def test_register_non_string_password_not_reflected(client_factory) -> None:
    client = client_factory()
    resp = client.post(REGISTER, json={"email": "a@b.com", "password": NON_STRING_PW})
    _assert_no_reflection(resp)


def test_login_invalid_password_not_reflected(client_factory) -> None:
    client = client_factory()
    _assert_no_reflection(
        client.post(LOGIN, json={"email": "a@b.com", "password": LOGIN_OVERLONG_PW})
    )


def test_login_non_string_password_not_reflected(client_factory) -> None:
    client = client_factory()
    _assert_no_reflection(client.post(LOGIN, json={"email": "a@b.com", "password": NON_STRING_PW}))


def test_validation_body_shape_is_preserved_for_frontend(client_factory) -> None:
    """The frontend reads detail[].loc / detail[].msg - keep them."""
    client = client_factory()
    resp = client.post(REGISTER, json={"email": "not-an-email", "password": SHORT_PW})
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    locs = {tuple(item["loc"]) for item in detail}
    assert ("body", "email") in locs
    assert ("body", "password") in locs
    assert all(isinstance(item["msg"], str) and item["msg"] for item in detail)
