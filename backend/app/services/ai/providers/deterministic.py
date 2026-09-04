"""Deterministic provider - development / test / CI, no external service.

It is **not** a general-purpose model and never claims to be. It does simple
intent matching over a small, documented set of infrastructure questions, runs
the matching read tools and formats a **grounded** Spanish answer from the real
tool results. Anything it does not recognise returns a clear "needs a configured
AI provider" message - it never guesses or fabricates entities.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from app.services.ai.providers.base import (
    AIProvider,
    ProviderRequest,
    ProviderResult,
)
from app.services.ai.tools import ToolPermissionError

_CRIT_STATUSES = ["Open", "Investigating", "Identified", "Monitoring"]


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", text).strip()


def _any(text: str, *terms: str) -> bool:
    return any(t in text for t in terms)


def _plural(n: int, one: str, many: str) -> str:
    return one if n == 1 else many


def _needs_provider(reason: str = "") -> ProviderResult:
    base = (
        "Esta consulta requiere un proveedor de IA avanzado. En el modo local "
        "puedo ayudarte a consultar activos, incidentes, sus relaciones y "
        "cronologías, los cambios recientes en Auditoría y el estado general de "
        "la infraestructura."
    )
    return ProviderResult(
        text=f"{base}" if not reason else f"{reason} {base}",
        suggestions=[
            "¿Cuántos activos críticos tenemos?",
            "Muéstrame los incidentes abiertos",
            "Resume el estado de la infraestructura",
        ],
    )


#: "What is / what does InfraGuard AI" style questions.
_ABOUT_TERMS = (
    "que es infraguard",
    "que hace infraguard",
    "para que sirve infraguard",
    "que es infra guard",
    "what is infraguard",
    "about infraguard",
)
#: "What can you do / help me with / consult" style questions.
_HELP_TERMS = (
    "que puedes hacer",
    "que sabes hacer",
    "que puede hacer",
    "que cosas puedes",
    "me puedes ayudar",
    "puedes ayudarme",
    "en que puedes ayudar",
    "en que me puedes ayudar",
    "como puedes ayudar",
    "como me puedes ayudar",
    "que puedes consultar",
    "que puedo preguntar",
    "que puedo consultar",
    "que informacion puedes",
    "que datos puedes",
    "que puedes analizar",
    "que modulos",
    "para que sirves",
    "que sabes",
    "what can you do",
    "what do you do",
    "how can you help",
    "help me with",
)


def _is_about_infraguard(q: str) -> bool:
    if _any(q, *_ABOUT_TERMS):
        return True
    return "infraguard" in q and _any(
        q, "que es", "que hace", "para que sirve", "what is", "what does"
    )


def _join_es(parts: list[str]) -> str:
    if len(parts) == 1:
        return parts[0]
    return ", ".join(parts[:-1]) + " y " + parts[-1]


class DeterministicProvider(AIProvider):
    name = "deterministic"

    def __init__(self, model: str) -> None:
        self.model = model

    @property
    def ready(self) -> bool:
        return True

    # -- entrypoint ---------------------------------------------------------

    def generate(self, request: ProviderRequest) -> ProviderResult:
        q = _norm(request.user_message)
        ctx = request.context
        ex = request.executor

        # Context-anchored questions take priority.
        if ctx is not None:
            if not ctx.available:
                return ProviderResult(
                    text=(
                        f"El contexto de esta conversación ({ctx.label}) ya no está "
                        "disponible para tu usuario: puede que no tengas permiso para "
                        "verlo o que se haya movido a la papelera."
                    )
                )
            if ctx.type == "asset":
                return self._asset_context(q, ctx, ex)
            if ctx.type == "incident":
                return self._incident_context(q, ctx, ex)

        # Cross-domain / global questions.
        if _any(
            q,
            "panorama",
            "estado general",
            "estado de la infraestructura",
            "resumen general",
            "vision general",
            "overview",
            "riesgo",
            "risk",
        ):
            return self._infra_overview(ex)

        if _any(
            q,
            "mas incidentes",
            "mayor actividad",
            "mas problematicos",
            "most incidents",
            "peor activo",
        ):
            return self._assets_most_incidents(ex)

        # Assets.
        if _any(q, "activo", "activos", "asset", "infraestructura", "servidor", "servidores"):
            if _any(q, "critico", "criticos", "critical"):
                return self._assets_critical(q, ex)
            if _any(q, "inactivo", "inactivos", "deshabilitado", "offline", "apagado", "inactive"):
                return self._assets_inactive(ex)
            if _any(
                q,
                "cuantos",
                "cuantas",
                "resumen",
                "inventario",
                "total",
                "distribu",
                "how many",
                "summary",
            ):
                return self._assets_summary(ex)
            if _any(
                q, "busca", "buscar", "encuentra", "search", "prod-", "staging-", "qa-", "dev-"
            ):
                return self._assets_search(request.user_message, ex)
            return self._assets_summary(ex)

        # Incidents.
        if _any(q, "incidente", "incidentes", "incident", "outage", "caida"):
            if _any(q, "abierto", "abiertos", "activo", "activos", "sin resolver", "open"):
                return self._incidents_open(ex)
            if _any(q, "critico", "criticos", "critical"):
                return self._incidents_critical(ex)
            if _any(q, "cuantos", "cuantas", "resumen", "estado", "how many", "summary"):
                return self._incidents_summary(ex)
            if _any(q, "busca", "buscar", "encuentra", "search"):
                return self._incidents_search(request.user_message, ex)
            return self._incidents_summary(ex)

        # Audit.
        if _any(
            q,
            "cambio",
            "cambios",
            "cambiaron",
            "auditoria",
            "audit",
            "actualizacion",
            "actualizaciones",
            "modifico",
            "modificaron",
            "reciente",
            "recientes",
        ):
            return self._audit_recent(ex)

        # Bounded product/help intent - answers questions about InfraGuard itself
        # without a real provider. It describes the application, never invents
        # operational facts, and returns no evidence (it is not a data lookup).
        if _is_about_infraguard(q):
            return self._product_about(ex)
        if _any(q, *_HELP_TERMS):
            return self._product_capabilities(ex)

        return _needs_provider()

    # -- product / help (static, permission-aware, no fabricated evidence) ---

    def _capabilities(self, ex: Any) -> list[str]:
        """Capability phrases scoped to what the caller's permissions allow -
        derived from tool availability, not a second copy of RBAC."""
        caps: list[str] = []
        if ex.can("search_assets"):
            caps.append(
                "encontrar y buscar activos, resumir el inventario e identificar "
                "activos críticos o inactivos"
            )
        if ex.can("search_incidents"):
            caps.append(
                "encontrar incidentes abiertos o críticos, revisar sus cronologías "
                "y analizar su relación con los activos afectados"
            )
        if ex.can("search_audit"):
            caps.append("consultar los cambios recientes registrados en Auditoría")
        if ex.can("search_assets") and ex.can("search_incidents"):
            caps.append("darte un panorama general del estado de la infraestructura")
        return caps

    def _help_suggestions(self, ex: Any) -> list[str]:
        s: list[str] = []
        if ex.can("search_assets"):
            s.append("Muéstrame los activos críticos")
        if ex.can("search_incidents"):
            s.append("Muéstrame los incidentes abiertos")
        if ex.can("search_assets") and ex.can("search_incidents"):
            s.append("Resume el estado de la infraestructura")
        if ex.can("search_audit"):
            s.append("Muéstrame los cambios recientes")
        return s[:4]

    def _product_about(self, ex: Any) -> ProviderResult:
        text = (
            "InfraGuard AI es una plataforma de inteligencia de infraestructura y "
            "gestión operativa. Reúne el inventario de activos, la gestión de "
            "incidentes con sus cronologías y activos afectados, el historial de "
            "Auditoría, la papelera con restauración y la administración de "
            "usuarios y roles (RBAC).\n\n"
            "El Asistente de IA es de solo lectura: te ayuda a consultar y analizar "
            "esos datos. No cambia infraestructura, no resuelve incidentes, no "
            "modifica usuarios y no navega por internet ni ejecuta comandos."
        )
        caps = self._capabilities(ex)
        if caps:
            text += "\n\nCon tus permisos actuales puedo " + _join_es(caps) + "."
        return ProviderResult(text=text, suggestions=self._help_suggestions(ex))

    def _product_capabilities(self, ex: Any) -> ProviderResult:
        caps = self._capabilities(ex)
        if not caps:
            return ProviderResult(
                text=(
                    "Ahora mismo tu usuario no tiene permisos de lectura sobre "
                    "activos, incidentes ni Auditoría, así que no puedo consultar "
                    "datos de infraestructura en tu nombre."
                )
            )
        return ProviderResult(
            text=(
                "Puedo ayudarte a "
                + _join_es(caps)
                + ". Todo en modo solo lectura: no modifico nada."
            ),
            suggestions=self._help_suggestions(ex),
        )

    # -- global -----------------------------------------------------------

    def _infra_overview(self, ex: Any) -> ProviderResult:
        parts: list[str] = []
        try:
            a = ex.call("summarize_assets")
            s = a.data
            parts.append(
                f"Inventario: {s['total']} activos ({s['active']} activos, "
                f"{s['inactive']} inactivos). Por criticidad: "
                + ", ".join(f"{k} {v}" for k, v in s["by_criticality"].items() if v)
                + "."
            )
        except ToolPermissionError:
            pass
        try:
            i = ex.call("summarize_incidents").data
            parts.append(
                f"Incidentes: {i['total']} en total, {i['open']} abiertos "
                f"({i['critical_open']} críticos), {i['resolved_recently']} resueltos "
                "en los últimos 7 días."
            )
        except ToolPermissionError:
            pass
        if not parts:
            return ProviderResult(text="No tienes permiso para consultar activos ni incidentes.")
        return ProviderResult(
            text="Panorama de la infraestructura. " + " ".join(parts),
            suggestions=[
                "Muéstrame los activos críticos",
                "¿Qué incidentes afectan a activos críticos?",
                "¿Qué cambió recientemente?",
            ],
        )

    def _assets_most_incidents(self, ex: Any) -> ProviderResult:
        try:
            res = ex.call("search_incidents", {"limit": 25})
        except ToolPermissionError as e:
            return self._denied(e)
        # Rank affected assets by incident linkage from the returned set.
        got = res.data["incidents"]
        if not got:
            return ProviderResult(text="No hay incidentes registrados.")
        return ProviderResult(
            text=(
                f"Encontré {res.data['total']} incidentes. Los de mayor severidad "
                "aparecen primero; abre cada uno para ver los activos afectados."
            ),
            suggestions=[
                "Muéstrame los incidentes críticos",
                "Resume el estado de la infraestructura",
            ],
        )

    # -- assets ---------------------------------------------------------

    def _assets_critical(self, q: str, ex: Any) -> ProviderResult:
        params: dict[str, Any] = {"criticality": ["Critical"], "limit": 25}
        env_note = ""
        if _any(q, "produccion", "production", "prod"):
            params["environment"] = "Production"
            env_note = " en Production"
        try:
            res = ex.call("search_assets", params)
        except ToolPermissionError as e:
            return self._denied(e)
        n = res.data["total"]
        if n == 0:
            return ProviderResult(text=f"No encontré activos Critical{env_note}.")
        names = ", ".join(a["name"] for a in res.data["assets"][:10])
        return ProviderResult(
            text=(
                f"Encontré {n} {_plural(n, 'activo', 'activos')} Critical{env_note}: {names}"
                + ("…" if res.data["returned"] < n else ".")
            ),
            suggestions=["¿Cuáles tienen incidentes abiertos?", "Muéstrame los activos inactivos"],
        )

    def _assets_inactive(self, ex: Any) -> ProviderResult:
        try:
            res = ex.call("search_assets", {"is_active": False, "limit": 25})
        except ToolPermissionError as e:
            return self._denied(e)
        n = res.data["total"]
        if n == 0:
            return ProviderResult(text="Todos los activos están activos ahora mismo.")
        names = ", ".join(a["name"] for a in res.data["assets"][:10])
        return ProviderResult(
            text=f"Hay {n} {_plural(n, 'activo inactivo', 'activos inactivos')}: {names}"
            + ("…" if res.data["returned"] < n else "."),
        )

    def _assets_summary(self, ex: Any) -> ProviderResult:
        try:
            res = ex.call("summarize_assets")
        except ToolPermissionError as e:
            return self._denied(e)
        s = res.data
        return ProviderResult(
            text=(
                f"Hay {s['total']} activos en total: {s['active']} activos y "
                f"{s['inactive']} inactivos. Por criticidad: "
                + ", ".join(f"{k} {v}" for k, v in s["by_criticality"].items() if v)
                + ". Por entorno: "
                + ", ".join(f"{k} {v}" for k, v in s["by_environment"].items() if v)
                + "."
            ),
            suggestions=["Muéstrame los activos críticos", "¿Qué activos están inactivos?"],
        )

    def _assets_search(self, raw: str, ex: Any) -> ProviderResult:
        term = _extract_term(raw)
        if not term:
            return ProviderResult(text="Dime qué activo quieres buscar (por nombre o hostname).")
        try:
            res = ex.call("search_assets", {"query": term, "limit": 10})
        except ToolPermissionError as e:
            return self._denied(e)
        got = res.data["assets"]
        if not got:
            return ProviderResult(text=f"No encontré ningún activo que coincida con «{term}».")
        if len(got) == 1:
            a = got[0]
            return ProviderResult(
                text=(
                    f"{a['name']}: {a['criticality']} · {a['environment']} · {a['type']}. "
                    f"Estado {a['status']}, {a['open_incidents']} "
                    f"{_plural(a['open_incidents'], 'incidente abierto', 'incidentes abiertos')}."
                ),
                suggestions=["¿Qué incidentes lo han afectado?", "¿Qué cambios recientes tiene?"],
            )
        return ProviderResult(
            text=f"Encontré {res.data['total']} activos que coinciden con «{term}»: "
            + ", ".join(a["name"] for a in got[:10])
            + ".",
        )

    # -- incidents ----------------------------------------------------

    def _incidents_open(self, ex: Any) -> ProviderResult:
        try:
            res = ex.call("search_incidents", {"status": _CRIT_STATUSES, "limit": 25})
        except ToolPermissionError as e:
            return self._denied(e)
        n = res.data["total"]
        if n == 0:
            return ProviderResult(text="No hay incidentes abiertos ahora mismo. 🎉")
        titles = "; ".join(f"{i['title']} ({i['severity']})" for i in res.data["incidents"][:8])
        return ProviderResult(
            text=f"Hay {n} {_plural(n, 'incidente abierto', 'incidentes abiertos')}: {titles}"
            + ("…" if res.data["returned"] < n else "."),
            suggestions=["Muéstrame solo los críticos", "¿Qué activos están afectados?"],
        )

    def _incidents_critical(self, ex: Any) -> ProviderResult:
        try:
            res = ex.call("search_incidents", {"severity": ["Critical"], "limit": 25})
        except ToolPermissionError as e:
            return self._denied(e)
        n = res.data["total"]
        if n == 0:
            return ProviderResult(text="No hay incidentes con severidad Critical.")
        titles = "; ".join(f"{i['title']} ({i['status']})" for i in res.data["incidents"][:8])
        return ProviderResult(
            text=f"Hay {n} {_plural(n, 'incidente Critical', 'incidentes Critical')}: {titles}."
        )

    def _incidents_summary(self, ex: Any) -> ProviderResult:
        try:
            res = ex.call("summarize_incidents")
        except ToolPermissionError as e:
            return self._denied(e)
        s = res.data
        return ProviderResult(
            text=(
                f"Hay {s['total']} incidentes en total: {s['open']} abiertos, "
                f"{s['critical_open']} críticos abiertos, {s['investigating']} en "
                f"investigación, {s['monitoring']} en monitoreo y "
                f"{s['resolved_recently']} resueltos en los últimos 7 días."
            ),
            suggestions=["Muéstrame los incidentes abiertos", "Muéstrame los incidentes críticos"],
        )

    def _incidents_search(self, raw: str, ex: Any) -> ProviderResult:
        term = _extract_term(raw)
        if not term:
            return ProviderResult(text="Dime qué incidente quieres buscar (por título).")
        try:
            res = ex.call("search_incidents", {"query": term, "limit": 10})
        except ToolPermissionError as e:
            return self._denied(e)
        got = res.data["incidents"]
        if not got:
            return ProviderResult(text=f"No encontré ningún incidente que coincida con «{term}».")
        return ProviderResult(
            text=f"Encontré {res.data['total']} incidentes que coinciden con «{term}»: "
            + "; ".join(f"{i['title']} ({i['severity']} · {i['status']})" for i in got[:8])
            + ".",
        )

    # -- audit ------------------------------------------------------

    def _audit_recent(self, ex: Any) -> ProviderResult:
        try:
            res = ex.call("search_audit", {"limit": 15})
        except ToolPermissionError as e:
            return self._denied(e)
        got = res.data["events"]
        if not got:
            return ProviderResult(text="No hay eventos de auditoría registrados.")
        lines = "; ".join(
            f"{e['action']} {e['entity_type']} «{e['entity_label']}»" for e in got[:8]
        )
        return ProviderResult(
            text=(
                f"Cambios más recientes en Auditoría ({res.data['total']} eventos "
                f"en total): {lines}."
            ),
            suggestions=["¿Qué cambió en un activo concreto?"],
        )

    # -- context: asset ----------------------------------------------

    def _asset_context(self, q: str, ctx: Any, ex: Any) -> ProviderResult:
        s = ctx.summary or {}
        if _any(q, "incidente", "afectado", "afectan", "problema"):
            try:
                res = ex.call("search_incidents", {"asset_id": s["id"], "limit": 15})
            except ToolPermissionError as e:
                return self._denied(e)
            n = res.data["total"]
            if n == 0:
                return ProviderResult(text=f"{ctx.label} no tiene incidentes asociados.")
            return ProviderResult(
                text=f"{ctx.label} aparece en {n} {_plural(n, 'incidente', 'incidentes')}: "
                + "; ".join(
                    f"{i['title']} ({i['severity']} · {i['status']})"
                    for i in res.data["incidents"][:8]
                )
                + ".",
            )
        if _any(q, "cambio", "cambios", "reciente", "auditoria", "audit", "historia"):
            if not ex.can("search_audit"):
                return ProviderResult(
                    text=(
                        "No tienes permiso para consultar la Auditoría, así que no "
                        "puedo mostrar los cambios de este activo."
                    )
                )
            res = ex.call("search_audit", {"entity_id": s["id"], "limit": 10})
            got = res.data["events"]
            if not got:
                return ProviderResult(
                    text=f"No hay cambios registrados para {ctx.label} en Auditoría."
                )
            return ProviderResult(
                text=f"Cambios de {ctx.label}: "
                + "; ".join(f"{e['action']} ({e['occurred_at'][:10]})" for e in got[:8])
                + ".",
            )
        # default: summarize
        try:
            res = ex.call("get_asset", {"asset_id": s["id"]})
        except ToolPermissionError as e:
            return self._denied(e)
        a = res.data.get("asset")
        if not a:
            return ProviderResult(text=f"{ctx.label} ya no está disponible.")
        state = "activo" if a["is_active"] else "inactivo"
        open_n = a["open_incidents"]
        open_label = _plural(open_n, "incidente abierto", "incidentes abiertos")
        return ProviderResult(
            text=(
                f"{a['name']} es un activo {a['criticality']} en {a['environment']} "
                f"({a['type']}). Estado {a['status']}, {state}, {open_n} {open_label}."
                + (f" Responsable: {a['owner']}." if a.get("owner") else "")
            ),
            suggestions=[
                "¿Qué incidentes lo han afectado?",
                "¿Qué cambios recientes tiene?",
            ],
        )

    # -- context: incident -----------------------------------------

    def _incident_context(self, q: str, ctx: Any, ex: Any) -> ProviderResult:
        s = ctx.summary or {}
        if _any(q, "cronologia", "timeline", "historia", "linea de tiempo", "evolucion"):
            try:
                res = ex.call("get_incident_timeline", {"incident_id": s["id"]})
            except ToolPermissionError as e:
                return self._denied(e)
            evs = res.data.get("events", [])
            if not evs:
                return ProviderResult(
                    text=f"El incidente «{ctx.label}» no tiene eventos en su cronología."
                )
            return ProviderResult(
                text=f"Cronología de «{ctx.label}»: "
                + " → ".join(f"{e['type']} ({e['at'][:10]})" for e in evs[:10])
                + ".",
            )
        if _any(q, "activo", "activos", "afectado", "afectados"):
            try:
                res = ex.call("get_incident", {"incident_id": s["id"]})
            except ToolPermissionError as e:
                return self._denied(e)
            inc = res.data.get("incident")
            if not inc:
                return ProviderResult(text=f"El incidente «{ctx.label}» ya no está disponible.")
            assets = inc.get("affected_assets", [])
            if not assets:
                return ProviderResult(
                    text=f"El incidente «{ctx.label}» no tiene activos afectados."
                )
            return ProviderResult(
                text=f"«{ctx.label}» afecta a {len(assets)} "
                f"{_plural(len(assets), 'activo', 'activos')}: "
                + ", ".join(f"{a['name']} ({a['criticality']})" for a in assets[:10])
                + ".",
            )
        try:
            res = ex.call("get_incident", {"incident_id": s["id"]})
        except ToolPermissionError as e:
            return self._denied(e)
        inc = res.data.get("incident")
        if not inc:
            return ProviderResult(text=f"El incidente «{ctx.label}» ya no está disponible.")
        return ProviderResult(
            text=(
                f"«{inc['title']}»: severidad {inc['severity']}, estado {inc['status']}, "
                f"prioridad {inc['priority']}. Afecta a {inc['affected_asset_count']} "
                f"{_plural(inc['affected_asset_count'], 'activo', 'activos')}."
                + (f" Responsable: {inc['owner']}." if inc.get("owner") else "")
            ),
            suggestions=[
                "¿Qué activos están afectados?",
                "Muéstrame su cronología",
            ],
        )

    # -- helpers --------------------------------------------------

    @staticmethod
    def _denied(exc: ToolPermissionError) -> ProviderResult:
        domain = exc.permission.split(".")[0]
        label = {
            "assets": "los activos",
            "incidents": "los incidentes",
            "audit": "la Auditoría",
        }.get(domain, domain)
        return ProviderResult(
            text=(
                f"No tienes permiso para consultar {label} en InfraGuard, así que "
                "el Asistente tampoco puede acceder a esos datos."
            )
        )


_TERM_RE = re.compile(r"[\"“”«»']([^\"“”«»']{1,80})[\"“”«»']")
_TOKEN_RE = re.compile(r"\b((?:prod|staging|qa|dev)-[a-z0-9-]+)\b", re.IGNORECASE)


def _extract_term(raw: str) -> str | None:
    m = _TERM_RE.search(raw)
    if m:
        return m.group(1).strip()
    m = _TOKEN_RE.search(raw)
    if m:
        return m.group(1).strip()
    # last resort: the word after "busca"/"activo"/"incidente"
    m = re.search(
        r"(?:busca(?:r)?|activo|incidente|asset|incident)\s+(?:el\s+|la\s+)?([A-Za-z0-9._-]{3,80})",
        raw,
        re.IGNORECASE,
    )
    return m.group(1).strip() if m else None
