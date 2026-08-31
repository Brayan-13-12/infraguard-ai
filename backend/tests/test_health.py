"""Tests for the health endpoints (liveness / readiness / summary)."""

from __future__ import annotations

LIVE_URL = "/api/v1/health/live"
READY_URL = "/api/v1/health/ready"
SUMMARY_URL = "/api/v1/health"

_LEAK_MARKERS = ("traceback", "psycopg", "password", "connection refused", "select 1")


# --- Liveness -------------------------------------------------------------

def test_liveness_is_200_regardless_of_database(client_factory) -> None:
    for db_healthy in (True, False):
        client = client_factory(db_healthy=db_healthy)
        resp = client.get(LIVE_URL)
        assert resp.status_code == 200
        assert resp.json() == {"status": "alive", "service": "infraguard-api"}


def test_liveness_does_not_open_a_db_session(client_factory, monkeypatch) -> None:
    import app.services.health as health_service

    def _boom(_db) -> bool:  # pragma: no cover - must never be called
        raise AssertionError("liveness must not check the database")

    monkeypatch.setattr(health_service, "check_database", _boom)
    client = client_factory(db_healthy=True)
    assert client.get(LIVE_URL).status_code == 200


# --- Readiness -----------------------------------------------------------

def test_readiness_ready_when_db_reachable(client_factory) -> None:
    resp = client_factory(db_healthy=True).get(READY_URL)
    assert resp.status_code == 200
    assert resp.json() == {
        "status": "ready",
        "service": "infraguard-api",
        "database": "healthy",
    }


def test_readiness_503_when_db_unreachable(client_factory) -> None:
    resp = client_factory(db_healthy=False).get(READY_URL)
    assert resp.status_code == 503
    assert resp.json() == {
        "status": "not_ready",
        "service": "infraguard-api",
        "database": "unhealthy",
    }


def test_readiness_never_leaks_internal_detail(client_factory) -> None:
    raw = client_factory(db_healthy=False).get(READY_URL).text.lower()
    for marker in _LEAK_MARKERS:
        assert marker not in raw


# --- Summary (backwards compatible) -------------------------------------

def test_summary_healthy(client_factory) -> None:
    resp = client_factory(db_healthy=True).get(SUMMARY_URL)
    assert resp.status_code == 200
    assert resp.json() == {
        "status": "healthy",
        "service": "infraguard-api",
        "database": "healthy",
    }


def test_summary_degraded(client_factory) -> None:
    resp = client_factory(db_healthy=False).get(SUMMARY_URL)
    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "degraded"
    assert body["database"] == "unhealthy"


def test_summary_never_leaks_internal_detail(client_factory) -> None:
    raw = client_factory(db_healthy=False).get(SUMMARY_URL).text.lower()
    for marker in _LEAK_MARKERS:
        assert marker not in raw


# --- OpenAPI contract --------------------------------------------------

def test_openapi_documents_all_health_paths(client_factory) -> None:
    schema = client_factory().get("/openapi.json").json()
    paths = schema["paths"]
    for url in (LIVE_URL, READY_URL, SUMMARY_URL):
        assert url in paths, url


def test_openapi_503_has_same_schema_as_200(client_factory) -> None:
    schema = client_factory().get("/openapi.json").json()

    for url, model in ((READY_URL, "ReadinessResponse"), (SUMMARY_URL, "HealthResponse")):
        responses = schema["paths"][url]["get"]["responses"]
        assert "503" in responses, f"{url} missing documented 503"
        for code in ("200", "503"):
            ref = responses[code]["content"]["application/json"]["schema"]["$ref"]
            assert ref.endswith(f"/{model}"), (url, code, ref)


def test_docs_available(client_factory) -> None:
    assert client_factory().get("/docs").status_code == 200
