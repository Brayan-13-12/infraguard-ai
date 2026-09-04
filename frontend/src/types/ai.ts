/**
 * AI Assistant domain types (AI milestone - v1, read-only).
 *
 * The network response is untrusted input - every shape has a runtime guard.
 * The assistant never mutates operational data, so there is no create/update
 * shape for assets / incidents here.
 */

export type AIMessageRole = "user" | "assistant";
export type AIEntityType = "asset" | "incident" | "audit_event";
export type AIEvidenceSource =
  | "assets"
  | "incidents"
  | "audit"
  | "incident_timeline"
  | "dashboard";

export interface AIEntityRef {
  type: AIEntityType;
  id: string;
  label: string;
}

export interface AIEvidenceItem {
  source: AIEvidenceSource;
  label: string;
  count: number;
}

export interface AIMessage {
  id: string;
  role: AIMessageRole;
  content: string;
  created_at: string;
  evidence: AIEvidenceItem[];
  entities: AIEntityRef[];
  suggestions: string[];
}

export interface AIConversationContext {
  type: "asset" | "incident";
  id: string;
  label: string;
  available: boolean;
}

export interface AIConversationListItem {
  id: string;
  title: string;
  context: AIConversationContext | null;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface AIConversationPage {
  items: AIConversationListItem[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface AIConversationDetail {
  id: string;
  title: string;
  context: AIConversationContext | null;
  created_at: string;
  updated_at: string;
  messages: AIMessage[];
}

export interface AIChatResponse {
  conversation_id: string;
  title: string;
  user_message: AIMessage;
  assistant_message: AIMessage;
}

export interface AIToolInfo {
  name: string;
  description: string;
  permission: string;
  available: boolean;
}

export interface AICapabilities {
  provider: string;
  model: string;
  ready: boolean;
  read_only: boolean;
  message_max_length: number;
  tools: AIToolInfo[];
}

/** Context passed to a new conversation (exactly one, or none). */
export interface AIContextInput {
  asset_id?: string;
  incident_id?: string;
}

// --- runtime guards -------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isEntityRef(v: unknown): v is AIEntityRef {
  return (
    isRecord(v) &&
    (v.type === "asset" || v.type === "incident" || v.type === "audit_event") &&
    typeof v.id === "string" &&
    typeof v.label === "string"
  );
}

function isEvidenceItem(v: unknown): v is AIEvidenceItem {
  return (
    isRecord(v) &&
    typeof v.source === "string" &&
    typeof v.label === "string" &&
    typeof v.count === "number"
  );
}

export function isAIMessage(v: unknown): v is AIMessage {
  if (!isRecord(v)) return false;
  return (
    typeof v.id === "string" &&
    (v.role === "user" || v.role === "assistant") &&
    typeof v.content === "string" &&
    typeof v.created_at === "string" &&
    Array.isArray(v.evidence) &&
    v.evidence.every(isEvidenceItem) &&
    Array.isArray(v.entities) &&
    v.entities.every(isEntityRef) &&
    isStringArray(v.suggestions)
  );
}

function isContext(v: unknown): v is AIConversationContext | null {
  if (v === null) return true;
  return (
    isRecord(v) &&
    (v.type === "asset" || v.type === "incident") &&
    typeof v.id === "string" &&
    typeof v.label === "string" &&
    typeof v.available === "boolean"
  );
}

export function isAIConversationListItem(v: unknown): v is AIConversationListItem {
  if (!isRecord(v)) return false;
  return (
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    isContext(v.context ?? null) &&
    typeof v.message_count === "number" &&
    typeof v.created_at === "string" &&
    typeof v.updated_at === "string"
  );
}

export function isAIConversationPage(v: unknown): v is AIConversationPage {
  if (!isRecord(v)) return false;
  return (
    Array.isArray(v.items) &&
    v.items.every(isAIConversationListItem) &&
    typeof v.page === "number" &&
    typeof v.total === "number" &&
    typeof v.total_pages === "number"
  );
}

export function isAIConversationDetail(v: unknown): v is AIConversationDetail {
  if (!isRecord(v)) return false;
  return (
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    isContext(v.context ?? null) &&
    typeof v.created_at === "string" &&
    typeof v.updated_at === "string" &&
    Array.isArray(v.messages) &&
    v.messages.every(isAIMessage)
  );
}

export function isAIChatResponse(v: unknown): v is AIChatResponse {
  if (!isRecord(v)) return false;
  return (
    typeof v.conversation_id === "string" &&
    typeof v.title === "string" &&
    isAIMessage(v.user_message) &&
    isAIMessage(v.assistant_message)
  );
}

export function isAICapabilities(v: unknown): v is AICapabilities {
  if (!isRecord(v)) return false;
  return (
    typeof v.provider === "string" &&
    typeof v.model === "string" &&
    typeof v.ready === "boolean" &&
    typeof v.message_max_length === "number" &&
    Array.isArray(v.tools)
  );
}
