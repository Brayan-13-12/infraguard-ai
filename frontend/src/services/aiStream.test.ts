import { afterEach, describe, expect, it, vi } from "vitest";
import { AIStreamParser } from "./aiStream";
import { streamMessage } from "./ai";

const message = { id: "m1", role: "user", content: "hola", created_at: "now", evidence: [], entities: [], suggestions: [] };
const response = { conversation_id: "c1", title: "Hola", user_message: message, assistant_message: { ...message, id: "m2", role: "assistant" } };
const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("AI SSE parser", () => {
  it("accepts every possible chunk boundary and Unicode", () => {
    const input = frame("text.delta", { delta: "¿Qué ocurrió? 🌎" }) + frame("turn.completed", response);
    for (let split = 0; split <= input.length; split++) {
      const parser = new AIStreamParser();
      expect([...parser.push(input.slice(0, split)), ...parser.push(input.slice(split))]).toEqual([
        { type: "text.delta", delta: "¿Qué ocurrió? 🌎" }, { type: "turn.completed", response },
      ]);
    }
  });
  it("handles CRLF, comments, unknown events and multiple events", () => {
    const parser = new AIStreamParser();
    expect(parser.push(": heartbeat\r\n\r\nevent: unknown\r\ndata: {}\r\n\r\n" +
      frame("turn.started", { user_message: message }) + frame("tool.started", { source: "assets" }))).toHaveLength(2);
  });
  it("validates event payloads and bounds incomplete frames", () => {
    expect(() => new AIStreamParser().push(frame("turn.completed", {}))).toThrow();
    expect(() => new AIStreamParser().push("x".repeat(100001))).toThrow();
  });
});

function mockStream(chunks: Uint8Array[]) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, body: new ReadableStream({
    start(controller) { chunks.forEach((c) => controller.enqueue(c)); controller.close(); },
  }) }));
}

it("decodes UTF-8 split across individual bytes and returns canonical completion", async () => {
  const bytes = new TextEncoder().encode(frame("text.delta", { delta: "producción 🌎" }) + frame("turn.completed", response));
  mockStream(Array.from(bytes, (b) => new Uint8Array([b])));
  const onEvent = vi.fn();
  expect(await streamMessage("c1", "hola", "request-1", onEvent)).toEqual({ ok: true, data: response });
  expect(onEvent).toHaveBeenCalledWith({ type: "text.delta", delta: "producción 🌎" });
});

it("a disconnect without completion fails instead of accepting partial output", async () => {
  mockStream([new TextEncoder().encode(frame("text.delta", { delta: "partial" }))]);
  expect(await streamMessage("c1", "hola", "request-1", vi.fn())).toEqual({ ok: false, error: { kind: "unreachable" } });
});

it.each(["provider_timeout", "provider_rate_limited", "provider_authentication_error", "tool_round_limit_exceeded"])("maps %s", async (code) => {
  mockStream([new TextEncoder().encode(frame("turn.failed", { code, message: "Safe error" }))]);
  expect(await streamMessage("c1", "hola", "request-1", vi.fn())).toEqual({ ok: false, error: { kind: code, message: "Safe error" } });
});

it("maps HTTP rate limiting before stream starts", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }));
  expect(await streamMessage("c1", "hola", "request-1", vi.fn())).toEqual({ ok: false, error: { kind: "rate_limited" } });
});
