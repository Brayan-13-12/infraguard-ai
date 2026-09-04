"""The deterministic provider - intent routing, grounding, no fabrication.

Uses a fake executor with canned tool results (no database)."""

from __future__ import annotations

from app.schemas.ai import AIEntityRef, AIEvidenceItem
from app.services.ai.providers.base import ProviderRequest
from app.services.ai.providers.deterministic import DeterministicProvider
from app.services.ai.tools import REGISTRY, ToolPermissionError, ToolResult


class FakeExecutor:
    def __init__(self, results: dict[str, ToolResult], *, denied: set[str] | None = None):
        self._results = results
        self._denied = denied or set()
        self.calls: list[str] = []

    def can(self, name: str) -> bool:
        return name not in self._denied

    def call(self, name: str, params: dict | None = None) -> ToolResult:
        self.calls.append(name)
        if name in self._denied:
            raise ToolPermissionError(name, REGISTRY[name].permission)
        return self._results[name]


def _req(text: str, executor, context=None) -> ProviderRequest:
    return ProviderRequest(user_message=text, history=[], context=context, executor=executor)


def _assets_result(total: int, names: list[str]) -> ToolResult:
    return ToolResult(
        data={
            "total": total,
            "returned": len(names),
            "assets": [
                {
                    "id": f"id-{n}",
                    "name": n,
                    "criticality": "Critical",
                    "environment": "Production",
                    "type": "Server",
                    "status": "Operational",
                    "is_active": True,
                    "open_incidents": 0,
                }
                for n in names
            ],
        },
        evidence=AIEvidenceItem(source="assets", label="Activos", count=total),
        entities=[AIEntityRef(type="asset", id=f"id-{n}", label=n) for n in names],
    )


def test_provider_is_always_ready_and_named() -> None:
    p = DeterministicProvider(model="m")
    assert p.ready is True
    assert p.name == "deterministic"


def test_critical_assets_intent_is_grounded() -> None:
    p = DeterministicProvider(model="m")
    ex = FakeExecutor({"search_assets": _assets_result(2, ["prod-api-01", "prod-api-02"])})
    res = p.generate(_req("muéstrame los activos críticos de producción", ex))
    assert "2" in res.text
    assert "prod-api-01" in res.text
    assert "search_assets" in ex.calls


def test_zero_results_are_reported_not_invented() -> None:
    p = DeterministicProvider(model="m")
    ex = FakeExecutor({"search_assets": _assets_result(0, [])})
    res = p.generate(_req("¿cuántos activos críticos hay?", ex))
    assert "no encontr" in res.text.lower() or "0" in res.text


def test_unsupported_query_asks_for_a_provider() -> None:
    p = DeterministicProvider(model="m")
    ex = FakeExecutor({})
    res = p.generate(_req("escríbeme un haiku sobre el clima de mañana", ex))
    assert "proveedor de ia" in res.text.lower()
    assert ex.calls == []


def test_denied_tool_yields_a_permission_message_not_data() -> None:
    p = DeterministicProvider(model="m")
    ex = FakeExecutor({"summarize_assets": _assets_result(1, ["x"])}, denied={"summarize_assets"})
    res = p.generate(_req("resume el inventario de activos", ex))
    assert "permiso" in res.text.lower()


def test_asset_context_summary_uses_the_context_entity() -> None:
    from app.services.ai.context import ResolvedContext

    p = DeterministicProvider(model="m")
    ctx = ResolvedContext(
        type="asset",
        id="ctx-1",
        label="prod-api-01",
        available=True,
        summary={
            "id": "ctx-1",
            "name": "prod-api-01",
            "criticality": "Critical",
            "environment": "Production",
            "type": "Server",
            "status": "Operational",
            "is_active": True,
            "owner": None,
        },
    )
    ex = FakeExecutor(
        {
            "get_asset": ToolResult(
                data={
                    "found": True,
                    "asset": {
                        "name": "prod-api-01",
                        "criticality": "Critical",
                        "environment": "Production",
                        "type": "Server",
                        "status": "Operational",
                        "is_active": True,
                        "open_incidents": 3,
                        "owner": "SRE",
                    },
                },
                evidence=AIEvidenceItem(source="assets", label="Activo", count=1),
                entities=[AIEntityRef(type="asset", id="ctx-1", label="prod-api-01")],
            )
        }
    )
    res = p.generate(_req("resume este activo", ex, context=ctx))
    assert "prod-api-01" in res.text
    assert "3" in res.text


def _ctx(label: str = "prod-api-01"):
    from app.services.ai.context import ResolvedContext

    return ResolvedContext(
        type="asset",
        id="ctx-1",
        label=label,
        available=True,
        summary={"id": "ctx-1", "name": label},
    )


def test_asset_context_dependencies_lists_outgoing_and_incoming() -> None:
    p = DeterministicProvider(model="m")
    ex = FakeExecutor(
        {
            "get_asset_relationships": ToolResult(
                data={
                    "found": True,
                    "outgoing": [
                        {
                            "relationship_type": "depends_on",
                            "other_asset": {"name": "prod-db-primary"},
                        },
                        {"relationship_type": "connects_to", "other_asset": {"name": "edge-fw-01"}},
                    ],
                    "incoming": [
                        {"relationship_type": "depends_on", "other_asset": {"name": "prod-web-01"}},
                    ],
                },
                evidence=AIEvidenceItem(source="relationships", label="Relaciones", count=3),
            )
        }
    )
    res = p.generate(_req("¿De qué depende este activo?", ex, context=_ctx()))
    assert "prod-db-primary" in res.text
    assert "prod-web-01" in res.text
    assert "edge-fw-01" not in res.text  # connects_to is not a dependency relation
    assert "get_asset_relationships" in ex.calls


def test_asset_context_dependencies_permission_denied() -> None:
    p = DeterministicProvider(model="m")
    ex = FakeExecutor({}, denied={"get_asset_relationships"})
    res = p.generate(_req("¿de qué depende?", ex, context=_ctx()))
    assert "permiso" in res.text.lower()


def test_asset_context_impact_lists_affected_assets() -> None:
    p = DeterministicProvider(model="m")
    ex = FakeExecutor(
        {
            "get_asset_impact": ToolResult(
                data={
                    "found": True,
                    "affected_assets": [
                        {"name": "prod-api-01", "distance": 1},
                        {"name": "prod-web-01", "distance": 2},
                    ],
                },
                evidence=AIEvidenceItem(source="topology", label="Impacto potencial", count=2),
            )
        }
    )
    res = p.generate(
        _req("¿Qué podría verse afectado si falla?", ex, context=_ctx("prod-db-primary"))
    )
    assert "prod-api-01" in res.text
    assert "prod-web-01" in res.text
    assert "2" in res.text


def test_asset_context_impact_no_affected_assets_is_reassuring_not_empty() -> None:
    p = DeterministicProvider(model="m")
    ex = FakeExecutor(
        {
            "get_asset_impact": ToolResult(
                data={"found": True, "affected_assets": []},
                evidence=AIEvidenceItem(source="topology", label="Impacto potencial", count=0),
            )
        }
    )
    res = p.generate(_req("impacto potencial si falla", ex, context=_ctx()))
    assert "ningún activo depende" in res.text.lower()


def test_unavailable_context_is_reported() -> None:
    from app.services.ai.context import ResolvedContext

    p = DeterministicProvider(model="m")
    ctx = ResolvedContext(type="asset", id="x", label="prod-gone", available=False)
    res = p.generate(_req("resume este activo", FakeExecutor({}), context=ctx))
    assert "no está disponible" in res.text


# -- product / help intent --------------------------------------------------


def test_what_is_infraguard_is_answered_without_a_provider() -> None:
    p = DeterministicProvider(model="m")
    ex = FakeExecutor({})
    res = p.generate(_req("¿Qué es InfraGuard AI?", ex))
    low = res.text.lower()
    assert "proveedor de ia" not in low
    assert "infraguard ai" in low
    assert "solo lectura" in low
    # describes the real modules, claims no capability it lacks
    assert "incidentes" in low and "auditoría" in low
    assert "ejecuta comandos" in low  # explicit "does NOT" clause
    assert ex.calls == []  # a description, not a data lookup


def test_what_can_you_do_is_answered_and_permission_aware() -> None:
    p = DeterministicProvider(model="m")
    full = p.generate(_req("¿Qué puedes hacer?", FakeExecutor({})))
    assert "proveedor de ia" not in full.text.lower()
    assert "activos" in full.text.lower() and "incidentes" in full.text.lower()
    assert full.suggestions  # useful follow-ups

    # a user without audit.read must not be told Audit investigation is available
    limited = p.generate(
        _req("¿En qué me puedes ayudar?", FakeExecutor({}, denied={"search_audit"}))
    )
    assert "auditoría" not in limited.text.lower()
    assert "cambios recientes" not in " ".join(limited.suggestions).lower()


def test_product_help_carries_no_fabricated_evidence() -> None:
    # The provider result has no evidence field; the orchestrator derives evidence
    # from executor tool calls - a product answer runs none.
    p = DeterministicProvider(model="m")
    ex = FakeExecutor({})
    p.generate(_req("¿Qué haces?", ex))
    assert ex.calls == []


def test_general_knowledge_still_needs_a_provider() -> None:
    p = DeterministicProvider(model="m")
    ex = FakeExecutor({})
    res = p.generate(_req("Explícame la teoría de la relatividad en detalle", ex))
    assert "proveedor de ia" in res.text.lower()
    assert ex.calls == []
