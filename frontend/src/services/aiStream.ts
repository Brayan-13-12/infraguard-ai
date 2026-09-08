import { isAIChatResponse, isAIMessage, type AIChatResponse, type AIMessage } from "@/types/ai";

export type AIStreamEvent =
  | { type: "turn.started"; user_message: AIMessage }
  | { type: "text.delta"; delta: string }
  | { type: "tool.started" | "tool.completed"; source: string; success?: boolean }
  | { type: "turn.completed"; response: AIChatResponse }
  | { type: "turn.failed"; code: string; message: string };

/** Incremental SSE framing, independent of network chunk and UTF-8 boundaries. */
export class AIStreamParser {
  private buffer = "";
  push(text: string): AIStreamEvent[] {
    this.buffer += text;
    const events: AIStreamEvent[] = [];
    let match: RegExpExecArray | null;
    while ((match = /\r?\n\r?\n/.exec(this.buffer))) {
      const frame = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      if (frame.length > 100_000) throw new Error("Oversized AI event");
      let name = "";
      const lines: string[] = [];
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith("event:")) name = line.slice(6).trim();
        if (line.startsWith("data:")) lines.push(line.slice(5).trimStart());
      }
      if (!lines.length) continue;
      if (!["turn.started", "text.delta", "tool.started", "tool.completed", "turn.completed", "turn.failed"].includes(name)) continue;
      const data: unknown = JSON.parse(lines.join("\n"));
      if (typeof data !== "object" || data === null) throw new Error("Invalid AI event");
      const d = data as Record<string, unknown>;
      if (name === "turn.started" && isAIMessage(d.user_message)) {
        events.push({ type: name, user_message: d.user_message });
      } else if (name === "text.delta" && typeof d.delta === "string") {
        events.push({ type: name, delta: d.delta });
      } else if ((name === "tool.started" || name === "tool.completed") && typeof d.source === "string" &&
        ["assets", "incidents", "audit", "relationships", "topology", "dashboard", "incident_timeline"].includes(d.source)) {
        events.push({ type: name, source: d.source, success: d.success === true });
      } else if (name === "turn.completed" && isAIChatResponse(data)) {
        events.push({ type: name, response: data });
      } else if (name === "turn.failed" && typeof d.code === "string" && typeof d.message === "string") {
        events.push({ type: name, code: d.code, message: d.message });
      } else throw new Error("Invalid AI event");
    }
    if (this.buffer.length > 100_000) throw new Error("Oversized AI event");
    return events;
  }
}
