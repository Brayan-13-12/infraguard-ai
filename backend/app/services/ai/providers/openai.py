"""Optional real provider: OpenAI-compatible chat completions with tool calling.

Kept deliberately small and dependency-free (stdlib ``urllib``) so enabling it
never changes the runtime dependency set and never affects CI / Docker / tests
(the default provider is ``deterministic``). It is fully behind
:class:`~app.services.ai.providers.base.AIProvider`:

* backend-only - the key never reaches the frontend;
* the model may ONLY call tools from ``executor.available()`` (the backend still
  authorizes every call);
* hard timeout + bounded tool-call rounds + bounded output;
* any failure raises :class:`ProviderUnavailable` - the orchestrator returns a
  typed, retry-safe error and never fabricates an answer.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from app.services.ai.providers.base import (
    SYSTEM_BOUNDARY,
    AIProvider,
    ProviderRequest,
    ProviderResult,
    ProviderTimeout,
    ProviderUnavailable,
)
from app.services.ai.tools import REGISTRY, ToolError

_MAX_ROUNDS = 4
_MAX_OUTPUT_TOKENS = 700


def _tool_schema(name: str) -> dict[str, Any]:
    tool = REGISTRY[name]
    schema = tool.input_model.model_json_schema()
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": tool.description,
            "parameters": {
                "type": "object",
                "properties": schema.get("properties", {}),
                "required": schema.get("required", []),
                "additionalProperties": False,
            },
        },
    }


class OpenAIProvider(AIProvider):
    name = "openai"

    def __init__(self, *, api_key: str | None, model: str, base_url: str, timeout: float) -> None:
        self._api_key = api_key
        self.model = model
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout

    @property
    def ready(self) -> bool:
        return bool(self._api_key)

    def generate(self, request: ProviderRequest) -> ProviderResult:
        if not self._api_key:
            raise ProviderUnavailable("AI_PROVIDER=openai but AI_API_KEY is not configured")

        ex = request.executor
        tools = [_tool_schema(t.name) for t in ex.available()]

        messages: list[dict[str, Any]] = [{"role": "system", "content": SYSTEM_BOUNDARY}]
        ctx = request.context
        if ctx is not None and ctx.available and ctx.summary:
            summary_json = json.dumps(ctx.summary, ensure_ascii=False)
            messages.append(
                {
                    "role": "system",
                    "content": f"Contexto de la conversación (entidad {ctx.type}): {summary_json}",
                }
            )
        for turn in request.history:
            messages.append({"role": turn.role, "content": turn.content})
        messages.append({"role": "user", "content": request.user_message})

        for _round in range(_MAX_ROUNDS):
            reply = self._post(
                {
                    "model": self.model,
                    "messages": messages,
                    "tools": tools or None,
                    "tool_choice": "auto" if tools else None,
                    "temperature": 0.2,
                    "max_tokens": _MAX_OUTPUT_TOKENS,
                }
            )
            choice = reply["choices"][0]["message"]
            tool_calls = choice.get("tool_calls") or []
            if not tool_calls:
                text = (choice.get("content") or "").strip()
                if not text:
                    raise ProviderUnavailable("empty response from provider")
                return ProviderResult(text=text, suggestions=[])

            messages.append(choice)
            for call in tool_calls:
                fn = call["function"]
                name = fn["name"]
                try:
                    args = json.loads(fn.get("arguments") or "{}")
                except json.JSONDecodeError:
                    args = {}
                try:
                    result = ex.call(name, args)
                    payload = json.dumps(result.data, ensure_ascii=False)[:6000]
                except ToolError as exc:
                    payload = json.dumps({"error": str(exc)}, ensure_ascii=False)
                messages.append({"role": "tool", "tool_call_id": call["id"], "content": payload})

        raise ProviderUnavailable("provider exceeded the tool-call round limit")

    def _post(self, body: dict[str, Any]) -> dict[str, Any]:
        req = urllib.request.Request(
            f"{self._base_url}/chat/completions",
            data=json.dumps({k: v for k, v in body.items() if v is not None}).encode(),
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:  # noqa: S310
                return json.loads(resp.read())
        except TimeoutError as exc:
            raise ProviderTimeout("provider request timed out") from exc
        except urllib.error.HTTPError as exc:
            raise ProviderUnavailable(f"provider returned HTTP {exc.code}") from exc
        except (urllib.error.URLError, OSError, json.JSONDecodeError) as exc:
            raise ProviderUnavailable(f"provider request failed: {type(exc).__name__}") from exc
