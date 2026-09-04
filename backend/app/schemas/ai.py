"""Request/response schemas for the AI Assistant API (v1 - read-only).

Input models set ``extra="forbid"``. The client can never set: the conversation
owner (the authenticated user), the message role (``assistant`` turns are
produced by the orchestrator), or any evidence/entity metadata (derived from the
tools that actually ran).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.config import settings
from app.models.ai import TITLE_MAX_LENGTH

__all__ = [
    "AICapabilities",
    "AIContextInput",
    "AIEntityRef",
    "AIEvidenceItem",
    "AIMessageRead",
    "AIToolInfo",
    "ChatResponse",
    "ConversationContextRead",
    "ConversationCreate",
    "ConversationDetail",
    "ConversationListItem",
    "ConversationPage",
    "MessageCreate",
    "MessageResponse",
]

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 30

EntityType = Literal["asset", "incident", "audit_event"]
EvidenceSource = Literal["assets", "incidents", "audit", "incident_timeline", "dashboard"]


class MessageResponse(BaseModel):
    detail: str


# --------------------------------------------------------------------------
# Input
# --------------------------------------------------------------------------


class AIContextInput(BaseModel):
    """Anchor a conversation to a single asset **or** incident. The backend
    re-validates the id and enforces the domain read permission on every use -
    a context id from the URL never bypasses RBAC."""

    model_config = ConfigDict(extra="forbid")

    asset_id: uuid.UUID | None = None
    incident_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _exactly_one_or_none(self) -> AIContextInput:
        if self.asset_id is not None and self.incident_id is not None:
            raise ValueError("provide at most one of asset_id / incident_id")
        return self

    @property
    def is_empty(self) -> bool:
        return self.asset_id is None and self.incident_id is None


class ConversationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, max_length=TITLE_MAX_LENGTH)
    context: AIContextInput | None = None

    @field_validator("title")
    @classmethod
    def _clean_title(cls, v: str | None) -> str | None:
        if v is None:
            return None
        stripped = v.strip()
        return stripped or None


class MessageCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str = Field(min_length=1, max_length=settings.AI_MESSAGE_MAX_LENGTH)

    @field_validator("content")
    @classmethod
    def _clean_content(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped


# --------------------------------------------------------------------------
# Output
# --------------------------------------------------------------------------


class AIEntityRef(BaseModel):
    """A safe reference to an InfraGuard entity mentioned in an answer. Uses the
    internal id + a safe label; the frontend renders a native card that links to
    the existing detail workspace."""

    type: EntityType
    id: str
    label: str


class AIEvidenceItem(BaseModel):
    """Where a grounded answer's facts came from - a tool + how many records."""

    source: EvidenceSource
    label: str
    count: int = Field(ge=0)


class AIMessageRead(BaseModel):
    id: uuid.UUID
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime
    evidence: list[AIEvidenceItem] = Field(default_factory=list)
    entities: list[AIEntityRef] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)


class ConversationContextRead(BaseModel):
    type: Literal["asset", "incident"]
    id: uuid.UUID
    label: str
    #: True when the current user can still read this entity (permission + live).
    available: bool


class ConversationListItem(BaseModel):
    id: uuid.UUID
    title: str
    context: ConversationContextRead | None = None
    message_count: int = Field(ge=0)
    created_at: datetime
    updated_at: datetime


class ConversationPage(BaseModel):
    items: list[ConversationListItem]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=MAX_PAGE_SIZE)
    total: int = Field(ge=0)
    total_pages: int = Field(ge=0)


class ConversationDetail(BaseModel):
    id: uuid.UUID
    title: str
    context: ConversationContextRead | None = None
    created_at: datetime
    updated_at: datetime
    messages: list[AIMessageRead]


class ChatResponse(BaseModel):
    conversation_id: uuid.UUID
    title: str
    user_message: AIMessageRead
    assistant_message: AIMessageRead


class AIToolInfo(BaseModel):
    name: str
    description: str
    permission: str
    #: True when the current user holds ``permission`` (so the tool can run).
    available: bool


class AICapabilities(BaseModel):
    """Non-secret description of the AI backend for the workspace UI."""

    provider: str
    model: str
    #: True when the assistant can actually answer (deterministic is always
    #: ready; a real provider needs a configured key).
    ready: bool
    read_only: bool = True
    message_max_length: int
    tools: list[AIToolInfo]
