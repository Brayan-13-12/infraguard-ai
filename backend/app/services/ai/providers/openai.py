"""Official OpenAI SDK Responses adapter; only custom read functions are exposed."""

from __future__ import annotations

import json
import time
from collections.abc import Iterator
from typing import Any

import openai

from app.services.ai.providers.base import (
    SYSTEM_BOUNDARY,
    AIProvider,
    ProviderAuthenticationError,
    ProviderEvent,
    ProviderNotConfigured,
    ProviderRateLimited,
    ProviderRequest,
    ProviderResult,
    ProviderTimeout,
    ProviderUnavailable,
    ToolRoundLimitExceeded,
)
from app.services.ai.tools import REGISTRY, ToolError

MAX_CALLS_PER_ROUND = 8
MAX_ARGUMENT_CHARS = 8000
MAX_TURN_TEXT = 20000
MAX_CONTEXT_CHARS = 160000


def _strict_schema(value: Any) -> Any:
    """Retain $defs/refs and bounds; strict functions require every property."""
    if isinstance(value, list):
        return [_strict_schema(v) for v in value]
    if not isinstance(value, dict):
        return value
    result = {k: _strict_schema(v) for k, v in value.items() if k not in ("default", "title")}
    if result.get("type") == "object":
        result["additionalProperties"] = False
        result["required"] = list(result.get("properties", {}))
    return result


def _tool_schema(name: str) -> dict[str, Any]:
    tool = REGISTRY[name]
    return {
        "type": "function",
        "name": name,
        "description": tool.description,
        "parameters": _strict_schema(tool.input_model.model_json_schema()),
        "strict": True,
    }


class OpenAIProvider(AIProvider):
    name = "openai"
    streaming = True

    def __init__(
        self,
        *,
        api_key: str | None,
        model: str,
        base_url: str,
        timeout: float,
        max_rounds: int = 6,
        max_output_tokens: int = 2000,
        client: Any = None,
    ) -> None:
        self._api_key = api_key
        self.model = model
        self._base_url = base_url
        self._timeout = timeout
        self._max_rounds = max(1, min(max_rounds, 8))
        self._max_output_tokens = max(128, min(max_output_tokens, 4000))
        self._client = client

    @property
    def ready(self) -> bool:
        return bool(self._api_key and self._api_key.strip())

    def generate(self, request: ProviderRequest) -> ProviderResult:
        for event in self.stream(request):
            if event.result is not None:
                return event.result
        raise ProviderUnavailable("missing final response")

    def stream(self, request: ProviderRequest) -> Iterator[ProviderEvent]:
        if not self.ready:
            raise ProviderNotConfigured("provider not configured")
        client = self._client or openai.OpenAI(
            api_key=self._api_key,
            base_url=self._base_url,
            timeout=self._timeout,
            max_retries=0,
        )
        try:
            yield from self._stream(client, request)
        except openai.AuthenticationError as exc:
            raise ProviderAuthenticationError("provider authentication failed") from exc
        except openai.RateLimitError as exc:
            raise ProviderRateLimited("provider rate limited") from exc
        except (openai.APITimeoutError, TimeoutError) as exc:
            raise ProviderTimeout("provider timed out") from exc
        except (
            openai.APIError,
            ValueError,
            KeyError,
            AttributeError,
            IndexError,
            TypeError,
        ) as exc:
            raise ProviderUnavailable("provider response unavailable") from exc
        finally:
            if self._client is None:
                client.close()

    def _stream(self, client: Any, request: ProviderRequest) -> Iterator[ProviderEvent]:
        executor = request.executor
        tools = [_tool_schema(t.name) for t in executor.available()]
        inputs: list[dict] = [
            {"role": t.role, "content": t.content[:4000]}
            for t in request.history[-50:]
            if t.role in ("user", "assistant")
        ]
        if request.context and request.context.available:
            # Identifier only. Actual facts must be fetched through tools.
            inputs.append(
                {
                    "role": "user",
                    "content": "Untrusted conversation context: "
                    + json.dumps({"type": request.context.type, "id": str(request.context.id)}),
                }
            )
        inputs.append({"role": "user", "content": request.user_message})
        deadline = time.monotonic() + self._timeout
        texts: list[str] = []
        text_length = 0
        for round_index in range(self._max_rounds + 1):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ProviderTimeout("turn deadline exceeded")
            if len(json.dumps(inputs, ensure_ascii=False)) > MAX_CONTEXT_CHARS:
                raise ToolRoundLimitExceeded("context budget exceeded")
            with client.responses.stream(
                model=self.model,
                instructions=SYSTEM_BOUNDARY,
                input=inputs,
                tools=tools,
                tool_choice="auto",
                parallel_tool_calls=True,
                max_output_tokens=self._max_output_tokens,
                store=False,
                timeout=remaining,
            ) as stream:
                for event in stream:
                    if time.monotonic() >= deadline:
                        raise ProviderTimeout("turn deadline exceeded")
                    if event.type == "response.output_text.delta":
                        text_length += len(event.delta)
                        if text_length > MAX_TURN_TEXT:
                            raise ToolRoundLimitExceeded("answer budget exceeded")
                        texts.append(event.delta)
                        yield ProviderEvent("text.delta", {"delta": event.delta})
                    elif event.type in ("error", "response.failed", "response.incomplete"):
                        raise ProviderUnavailable("provider did not complete")
                response = stream.get_final_response()
            if response.status != "completed":
                raise ProviderUnavailable("incomplete response")
            calls = [item for item in response.output if item.type == "function_call"]
            if not calls:
                text = "".join(texts).strip()
                if not text:
                    raise ProviderUnavailable("empty response")
                yield ProviderEvent("provider.completed", result=ProviderResult(text=text))
                return
            if round_index >= self._max_rounds or len(calls) > MAX_CALLS_PER_ROUND:
                raise ToolRoundLimitExceeded("tool round limit exceeded")
            # Continuation items stay transient in this adapter, never logs/DB/API events.
            inputs.extend(item.model_dump(exclude_none=True) for item in response.output)
            for call in calls:
                if time.monotonic() >= deadline:
                    raise ProviderTimeout("turn deadline exceeded")
                if len(call.arguments) > MAX_ARGUMENT_CHARS:
                    raise ToolRoundLimitExceeded("argument budget exceeded")
                try:
                    args = json.loads(call.arguments)
                    if not isinstance(args, dict):
                        raise ValueError("arguments must be an object")
                except (json.JSONDecodeError, ValueError):
                    payload = {"error": "invalid_tool_arguments"}
                else:
                    family = executor.family(call.name)
                    if family:
                        yield ProviderEvent("tool.started", {"source": family})
                    try:
                        result = executor.call(call.name, args)
                        payload = result.data
                    except ToolError:
                        payload = {"error": "tool_execution_failed"}
                    if family:
                        yield ProviderEvent(
                            "tool.completed",
                            {
                                "source": family,
                                "success": "error" not in payload,
                            },
                        )
                inputs.append(
                    {
                        "type": "function_call_output",
                        "call_id": call.call_id,
                        "output": json.dumps(payload, ensure_ascii=False),
                    }
                )
        raise ToolRoundLimitExceeded("tool round limit exceeded")
