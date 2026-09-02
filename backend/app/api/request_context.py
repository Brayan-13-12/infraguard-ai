"""Request correlation id + the per-request context the audit writer needs.

* A lightweight **request id** is attached to every request by
  :func:`request_id_middleware` (registered in ``app.main``). An incoming
  ``X-Request-ID`` is honoured **only** if it is a short, safe token; otherwise a
  fresh UUID hex is generated. It is echoed back as ``X-Request-ID`` and stored
  on ``request.state.request_id``.
* :func:`get_request_context` reads the id plus the **direct** client ip and the
  user-agent. Forwarded headers (``X-Forwarded-For`` …) are **not** trusted -
  there is no configured trusted-proxy layer. IP / UA are context, never
  identity.
* :func:`get_audit_context` combines that with the authenticated user to produce
  an :class:`~app.services.audit.AuditContext` (actor snapshot + request info).
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from fastapi import Depends, Request
from starlette.responses import Response

from app.api.deps import get_current_user
from app.models.user import User
from app.services.audit import AuditContext

_SAFE_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
REQUEST_ID_HEADER = "X-Request-ID"


def _resolve_request_id(incoming: str | None) -> str:
    if incoming and _SAFE_REQUEST_ID.match(incoming):
        return incoming
    return uuid.uuid4().hex


async def request_id_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    request_id = _resolve_request_id(request.headers.get(REQUEST_ID_HEADER))
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers[REQUEST_ID_HEADER] = request_id
    return response


@dataclass(frozen=True, slots=True)
class RequestContext:
    request_id: str | None
    ip_address: str | None
    user_agent: str | None


def get_request_context(request: Request) -> RequestContext:
    ua = (request.headers.get("user-agent") or "").strip()[:500] or None
    return RequestContext(
        request_id=getattr(request.state, "request_id", None),
        ip_address=request.client.host if request.client else None,
        user_agent=ua,
    )


def get_audit_context(
    ctx: RequestContext = Depends(get_request_context),
    user: User = Depends(get_current_user),
) -> AuditContext:
    return AuditContext(
        actor_user_id=user.id,
        actor_email=user.email,
        request_id=ctx.request_id,
        ip_address=ctx.ip_address,
        user_agent=ctx.user_agent,
    )
