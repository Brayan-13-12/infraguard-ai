"""Provider selection - one place that reads config and returns an ``AIProvider``."""

from __future__ import annotations

from functools import lru_cache

from app.core.config import settings
from app.services.ai.providers.base import (
    SYSTEM_BOUNDARY,
    AIProvider,
    HistoryTurn,
    ProviderError,
    ProviderRequest,
    ProviderResult,
    ProviderTimeout,
    ProviderUnavailable,
    ProviderUnsupported,
)
from app.services.ai.providers.deterministic import DeterministicProvider
from app.services.ai.providers.openai import OpenAIProvider

__all__ = [
    "AIProvider",
    "HistoryTurn",
    "ProviderError",
    "ProviderRequest",
    "ProviderResult",
    "ProviderTimeout",
    "ProviderUnavailable",
    "ProviderUnsupported",
    "SYSTEM_BOUNDARY",
    "build_provider",
    "get_provider",
]


def build_provider() -> AIProvider:
    if settings.AI_PROVIDER == "openai":
        return OpenAIProvider(
            api_key=settings.AI_API_KEY,
            model=settings.AI_MODEL,
            base_url=settings.AI_OPENAI_BASE_URL,
            timeout=settings.AI_REQUEST_TIMEOUT_SECONDS,
        )
    return DeterministicProvider(model=settings.AI_MODEL)


@lru_cache(maxsize=1)
def _cached() -> AIProvider:
    return build_provider()


def get_provider() -> AIProvider:
    """The configured provider (cached). Tests can pass their own to the
    orchestrator, so this stays a thin accessor."""
    return _cached()
