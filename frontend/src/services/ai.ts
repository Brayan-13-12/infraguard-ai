import { AI_ENDPOINT, AI_CONVERSATIONS_PAGE_SIZE } from "@/lib/config";
import {
  isAICapabilities,
  isAIChatResponse,
  isAIConversationDetail,
  isAIConversationPage,
  type AICapabilities,
  type AIChatResponse,
  type AIContextInput,
  type AIConversationDetail,
  type AIConversationPage,
} from "@/types/ai";

const REQUEST_TIMEOUT_MS = 45_000; // an AI turn may run several tool queries

export type AIErrorKind =
  | "unreachable"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "rate_limited"
  | "provider_unavailable"
  | "provider_timeout"
  | "unexpected";

export interface AIError {
  kind: AIErrorKind;
  /** Server-supplied safe message for provider errors, if any. */
  message?: string;
}

export type AIResult<T> = { ok: true; data: T } | { ok: false; error: AIError };

async function request(
  url: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      signal: controller.signal,
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function detailCode(body: unknown): string | undefined {
  if (typeof body === "object" && body !== null) {
    const d = (body as { detail?: unknown }).detail;
    if (typeof d === "object" && d !== null) {
      const c = (d as { code?: unknown }).code;
      if (typeof c === "string") return c;
    }
  }
  return undefined;
}

function detailMessage(body: unknown): string | undefined {
  if (typeof body === "object" && body !== null) {
    const d = (body as { detail?: unknown }).detail;
    if (typeof d === "object" && d !== null) {
      const m = (d as { message?: unknown }).message;
      if (typeof m === "string") return m;
    }
  }
  return undefined;
}

function errorFor(status: number, body: unknown): AIError {
  if (status === 401) return { kind: "unauthorized" };
  if (status === 403) return { kind: "forbidden" };
  if (status === 404) return { kind: "not_found" };
  if (status === 422) return { kind: "validation" };
  if (status === 429) return { kind: "rate_limited" };
  if (status === 503) {
    const code = detailCode(body);
    if (code === "provider_timeout") {
      return { kind: "provider_timeout", message: detailMessage(body) };
    }
    return { kind: "provider_unavailable", message: detailMessage(body) };
  }
  return { kind: "unexpected" };
}

// --- Capabilities ------------------------------------------------------

export async function getCapabilities(): Promise<AIResult<AICapabilities>> {
  const res = await request(`${AI_ENDPOINT}/capabilities`);
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isAICapabilities(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

// --- Conversations ----------------------------------------------------

export async function listConversations(
  page = 1,
  pageSize = AI_CONVERSATIONS_PAGE_SIZE,
): Promise<AIResult<AIConversationPage>> {
  const res = await request(
    `${AI_ENDPOINT}/conversations?page=${page}&page_size=${pageSize}`,
  );
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isAIConversationPage(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

export async function createConversation(input: {
  title?: string;
  context?: AIContextInput;
} = {}): Promise<AIResult<AIConversationDetail>> {
  const body: Record<string, unknown> = {};
  if (input.title) body.title = input.title;
  if (input.context && (input.context.asset_id || input.context.incident_id)) {
    body.context = input.context;
  }
  const res = await request(`${AI_ENDPOINT}/conversations`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 201 && isAIConversationDetail(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

export async function getConversation(
  id: string,
): Promise<AIResult<AIConversationDetail>> {
  const res = await request(`${AI_ENDPOINT}/conversations/${encodeURIComponent(id)}`);
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isAIConversationDetail(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}

export async function deleteConversation(id: string): Promise<AIResult<null>> {
  const res = await request(`${AI_ENDPOINT}/conversations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200) return { ok: true, data: null };
  return { ok: false, error: errorFor(res.status, res.body) };
}

export async function sendMessage(
  conversationId: string,
  content: string,
): Promise<AIResult<AIChatResponse>> {
  const res = await request(
    `${AI_ENDPOINT}/conversations/${encodeURIComponent(conversationId)}/messages`,
    { method: "POST", body: JSON.stringify({ content }) },
  );
  if (res === null) return { ok: false, error: { kind: "unreachable" } };
  if (res.status === 200 && isAIChatResponse(res.body)) return { ok: true, data: res.body };
  return { ok: false, error: errorFor(res.status, res.body) };
}
