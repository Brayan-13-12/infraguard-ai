import { AI_ENDPOINT, AI_CONVERSATIONS_PAGE_SIZE } from "@/lib/config";
import { AIStreamParser, type AIStreamEvent } from "./aiStream";
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
  | "provider_not_configured"
  | "provider_authentication_error"
  | "provider_rate_limited"
  | "tool_execution_failed"
  | "tool_round_limit_exceeded"
  | "turn_in_progress"
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
  const code = detailCode(body);
  const providerCodes: AIErrorKind[] = ["provider_not_configured", "provider_authentication_error",
    "provider_rate_limited", "provider_timeout", "provider_unavailable", "tool_execution_failed",
    "tool_round_limit_exceeded", "turn_in_progress"];
  if (code && providerCodes.includes(code as AIErrorKind)) {
    return { kind: code as AIErrorKind, message: detailMessage(body) };
  }
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

export async function streamMessage(
  conversationId: string, content: string, requestId: string,
  onEvent: (event: AIStreamEvent) => void,
): Promise<AIResult<AIChatResponse>> {
  const controller = new AbortController();
  // Above the backend's hard 120-second maximum plus transport/cleanup allowance.
  const timer = setTimeout(() => controller.abort(), 150_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const res = await fetch(`${AI_ENDPOINT}/conversations/${encodeURIComponent(conversationId)}/messages/stream`, {
      method: "POST", credentials: "include", cache: "no-store", signal: controller.signal,
      headers: { Accept: "text/event-stream", "Content-Type": "application/json" },
      body: JSON.stringify({ content, request_id: requestId }),
    });
    if (!res.ok) return { ok: false, error: errorFor(res.status, await res.json().catch(() => null)) };
    if (!res.body) return { ok: false, error: { kind: "unreachable" } };
    reader = res.body.getReader();
    const decoder = new TextDecoder();
    const parser = new AIStreamParser();
    let length = 0;
    while (true) {
      const { value, done } = await reader.read();
      const events = parser.push(decoder.decode(value, { stream: !done }));
      for (const event of events) {
        if (event.type === "text.delta") {
          length += event.delta.length;
          if (length > 20000) throw new Error("Oversized answer");
        }
        onEvent(event);
        if (event.type === "turn.completed") return { ok: true, data: event.response };
        if (event.type === "turn.failed") return {
          ok: false, error: errorFor(503, { detail: { code: event.code, message: event.message } }),
        };
      }
      if (done) return { ok: false, error: { kind: "unreachable" } };
    }
  } catch {
    return { ok: false, error: { kind: controller.signal.aborted ? "provider_timeout" : "unreachable" } };
  } finally {
    clearTimeout(timer);
    await reader?.cancel().catch(() => undefined);
    reader?.releaseLock();
    controller.abort();
  }
}
