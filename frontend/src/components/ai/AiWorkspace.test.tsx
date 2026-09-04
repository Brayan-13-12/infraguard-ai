import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiWorkspace } from "@/components/ai/AiWorkspace";
import { LanguageProvider } from "@/i18n";
import * as aiService from "@/services/ai";
import { MockAuthProvider } from "@/test/MockAuthProvider";
import { makeUser } from "@/test/fixtures";
import type {
  AICapabilities,
  AIChatResponse,
  AIConversationDetail,
  AIConversationListItem,
  AIConversationPage,
  AIMessage,
} from "@/types/ai";

let mockSearchParams = new URLSearchParams("");
// Mirror the real router: replace() updates the query the component reads, so a
// URL change on send genuinely re-runs the load effect (this is the shape of
// the double-render race the reconciliation fix has to survive).
const replace = vi.fn((url: string) => {
  const i = url.indexOf("?");
  mockSearchParams = new URLSearchParams(i >= 0 ? url.slice(i + 1) : "");
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/ai",
  useSearchParams: () => mockSearchParams,
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const CAPS: AICapabilities = {
  provider: "deterministic",
  model: "infraguard-deterministic-v1",
  ready: true,
  read_only: true,
  message_max_length: 4000,
  tools: [],
};

function msg(over: Partial<AIMessage> = {}): AIMessage {
  return {
    id: `m-${Math.random().toString(36).slice(2)}`,
    role: "user",
    content: "hola",
    created_at: "2026-09-03T10:00:00Z",
    evidence: [],
    entities: [],
    suggestions: [],
    ...over,
  };
}

function listItem(over: Partial<AIConversationListItem> = {}): AIConversationListItem {
  return {
    id: "c1",
    title: "Activos críticos",
    context: null,
    message_count: 2,
    created_at: "2026-09-03T09:00:00Z",
    updated_at: "2026-09-03T09:30:00Z",
    ...over,
  };
}

function page(items: AIConversationListItem[]): AIConversationPage {
  return { items, page: 1, page_size: 30, total: items.length, total_pages: 1 };
}

function detail(over: Partial<AIConversationDetail> = {}): AIConversationDetail {
  return {
    id: "c1",
    title: "Activos críticos",
    context: null,
    created_at: "2026-09-03T09:00:00Z",
    updated_at: "2026-09-03T09:30:00Z",
    messages: [],
    ...over,
  };
}

function chatResponse(over: Partial<AIChatResponse> = {}): AIChatResponse {
  return {
    conversation_id: "c1",
    title: "Activos críticos",
    user_message: msg({ role: "user", content: "¿Cuántos activos críticos hay?" }),
    assistant_message: msg({
      role: "assistant",
      content: "Encontré 3 activos críticos en producción.",
      evidence: [{ source: "assets", label: "Activos", count: 3 }],
      entities: [{ type: "asset", id: "a1", label: "prod-api-01" }],
      suggestions: ["¿Qué incidentes los afectan?"],
    }),
    ...over,
  };
}

function renderWorkspace(user = makeUser()) {
  return render(
    <LanguageProvider>
      <MockAuthProvider user={user}>
        <AiWorkspace />
      </MockAuthProvider>
    </LanguageProvider>,
  );
}

beforeEach(() => {
  replace.mockClear();
  mockSearchParams = new URLSearchParams("");
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("min-width"),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  vi.spyOn(aiService, "getCapabilities").mockResolvedValue({ ok: true, data: CAPS });
  vi.spyOn(aiService, "listConversations").mockResolvedValue({ ok: true, data: page([]) });
});

afterEach(() => vi.restoreAllMocks());

describe("AiWorkspace", () => {
  it("shows the empty state with the investigation prompt and suggestions", async () => {
    renderWorkspace();
    expect(await screen.findByText("¿Qué quieres investigar?")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /activos críticos de producción/i }),
    ).toBeInTheDocument();
  });

  it("creates a conversation and sends the first message from a suggested prompt", async () => {
    const created = detail({ messages: [] });
    vi.spyOn(aiService, "createConversation").mockResolvedValue({ ok: true, data: created });
    vi.spyOn(aiService, "sendMessage").mockResolvedValue({ ok: true, data: chatResponse() });

    renderWorkspace();
    const prompt = await screen.findByRole("button", {
      name: /activos críticos de producción/i,
    });
    await userEvent.click(prompt);

    await waitFor(() => expect(aiService.createConversation).toHaveBeenCalled());
    await waitFor(() => expect(aiService.sendMessage).toHaveBeenCalledWith("c1", expect.any(String)));
    expect(
      await screen.findByText("Encontré 3 activos críticos en producción."),
    ).toBeInTheDocument();
  });

  it("renders evidence sources and an entity card that links to the asset", async () => {
    mockSearchParams = new URLSearchParams("c=c1");
    vi.spyOn(aiService, "getConversation").mockResolvedValue({
      ok: true,
      data: detail({
        messages: [
          msg({ role: "user", content: "¿Cuántos activos críticos?" }),
          chatResponse().assistant_message,
        ],
      }),
    });

    renderWorkspace();

    expect(
      await screen.findByText("Encontré 3 activos críticos en producción."),
    ).toBeInTheDocument();
    expect(screen.getByText("Fuentes")).toBeInTheDocument();
    const card = screen.getByRole("link", { name: /prod-api-01/i });
    expect(card).toHaveAttribute("href", "/assets/a1");
  });

  it("submits a typed message with Enter and disables duplicate sends", async () => {
    mockSearchParams = new URLSearchParams("c=c1");
    vi.spyOn(aiService, "getConversation").mockResolvedValue({ ok: true, data: detail() });
    let resolve!: (v: aiService.AIResult<AIChatResponse>) => void;
    vi.spyOn(aiService, "sendMessage").mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    renderWorkspace();
    const box = await screen.findByLabelText(/pregunta sobre tu infraestructura/i);
    await userEvent.type(box, "¿Cuántos incidentes abiertos hay?");
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(aiService.sendMessage).toHaveBeenCalledTimes(1));
    // While in flight a second Enter must not fire another request.
    await userEvent.type(box, "otra vez");
    await userEvent.keyboard("{Enter}");
    expect(aiService.sendMessage).toHaveBeenCalledTimes(1);

    resolve({ ok: true, data: chatResponse() });
    await screen.findByText("Encontré 3 activos críticos en producción.");
  });

  it("keeps exactly one user message and offers retry when the provider is unavailable", async () => {
    mockSearchParams = new URLSearchParams("c=c1");
    vi.spyOn(aiService, "getConversation").mockResolvedValue({ ok: true, data: detail() });
    vi.spyOn(aiService, "sendMessage").mockResolvedValue({
      ok: false,
      error: { kind: "provider_unavailable" },
    });

    renderWorkspace();
    const box = await screen.findByLabelText(/pregunta sobre tu infraestructura/i);
    await userEvent.type(box, "Texto irrepetible de prueba");
    await userEvent.keyboard("{Enter}");

    expect(
      await screen.findByText(/proveedor de ia no está disponible/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reintentar/i })).toBeInTheDocument();
    // the user turn stays visible, exactly once
    expect(screen.getAllByText("Texto irrepetible de prueba")).toHaveLength(1);
  });

  it("renders the user message exactly once when a new conversation is created", async () => {
    const created = detail({ id: "c9", messages: [] });
    vi.spyOn(aiService, "createConversation").mockResolvedValue({ ok: true, data: created });
    // If the fix regressed and the conversation were refetched mid-send, this
    // would feed a second copy of the (already-persisted) user turn into state.
    const getConv = vi.spyOn(aiService, "getConversation").mockResolvedValue({
      ok: true,
      data: detail({
        id: "c9",
        messages: [
          msg({ id: "srv-u", role: "user", content: "Hola equipo" }),
          msg({ id: "srv-a0", role: "assistant", content: "Respuesta del asistente." }),
        ],
      }),
    });
    vi.spyOn(aiService, "sendMessage").mockResolvedValue({
      ok: true,
      data: chatResponse({
        conversation_id: "c9",
        user_message: msg({ id: "srv-u", role: "user", content: "Hola equipo" }),
        assistant_message: msg({
          id: "srv-a",
          role: "assistant",
          content: "Respuesta del asistente.",
        }),
      }),
    });

    renderWorkspace();
    const box = await screen.findByLabelText(/pregunta sobre tu infraestructura/i);
    await userEvent.type(box, "Hola equipo");
    await userEvent.keyboard("{Enter}");

    await screen.findByText("Respuesta del asistente.");
    expect(screen.getAllByText("Hola equipo")).toHaveLength(1);
    expect(screen.getAllByText("Respuesta del asistente.")).toHaveLength(1);
    // the just-created conversation is held in state, not refetched
    expect(getConv).not.toHaveBeenCalled();
  });

  it("renders one pending user bubble while the turn is in flight", async () => {
    mockSearchParams = new URLSearchParams("c=c1");
    vi.spyOn(aiService, "getConversation").mockResolvedValue({ ok: true, data: detail() });
    let resolve!: (v: aiService.AIResult<AIChatResponse>) => void;
    vi.spyOn(aiService, "sendMessage").mockReturnValue(new Promise((r) => (resolve = r)));

    renderWorkspace();
    const box = await screen.findByLabelText(/pregunta sobre tu infraestructura/i);
    await userEvent.type(box, "Consulta única");
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(aiService.sendMessage).toHaveBeenCalled());
    expect(screen.getAllByText("Consulta única")).toHaveLength(1);

    resolve({
      ok: true,
      data: chatResponse({
        conversation_id: "c1",
        user_message: msg({ id: "u", role: "user", content: "Consulta única" }),
        assistant_message: msg({ id: "a", role: "assistant", content: "Listo." }),
      }),
    });
    await screen.findByText("Listo.");
    expect(screen.getAllByText("Consulta única")).toHaveLength(1);
    expect(screen.getAllByText("Listo.")).toHaveLength(1);
  });

  it("shows two user turns for a deliberately repeated identical message", async () => {
    mockSearchParams = new URLSearchParams("c=c1");
    vi.spyOn(aiService, "getConversation").mockResolvedValue({ ok: true, data: detail() });
    let n = 0;
    vi.spyOn(aiService, "sendMessage").mockImplementation(async () => {
      n += 1;
      return {
        ok: true,
        data: chatResponse({
          conversation_id: "c1",
          user_message: msg({ id: `u${n}`, role: "user", content: "Activos críticos" }),
          assistant_message: msg({ id: `a${n}`, role: "assistant", content: `Respuesta ${n}` }),
        }),
      };
    });

    renderWorkspace();
    const box = await screen.findByLabelText(/pregunta sobre tu infraestructura/i);
    await userEvent.type(box, "Activos críticos");
    await userEvent.keyboard("{Enter}");
    await screen.findByText("Respuesta 1");
    await userEvent.type(box, "Activos críticos");
    await userEvent.keyboard("{Enter}");
    await screen.findByText("Respuesta 2");

    // identity-based, not content-based: both identical user turns are kept
    expect(screen.getAllByText("Activos críticos")).toHaveLength(2);
  });

  it("does not duplicate the user turn on retry after a provider failure", async () => {
    mockSearchParams = new URLSearchParams("c=c1");
    vi.spyOn(aiService, "getConversation").mockResolvedValue({ ok: true, data: detail() });
    let attempt = 0;
    vi.spyOn(aiService, "sendMessage").mockImplementation(async () => {
      attempt += 1;
      if (attempt === 1) return { ok: false, error: { kind: "provider_unavailable" } };
      return {
        ok: true,
        data: chatResponse({
          conversation_id: "c1",
          user_message: msg({ id: "u-final", role: "user", content: "Reintento único" }),
          assistant_message: msg({ id: "a-final", role: "assistant", content: "Al fin." }),
        }),
      };
    });

    renderWorkspace();
    const box = await screen.findByLabelText(/pregunta sobre tu infraestructura/i);
    await userEvent.type(box, "Reintento único");
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("button", { name: /reintentar/i });
    expect(screen.getAllByText("Reintento único")).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    await screen.findByText("Al fin.");
    expect(screen.getAllByText("Reintento único")).toHaveLength(1);
    expect(screen.getAllByText("Al fin.")).toHaveLength(1);
  });

  it("warns when the configured provider is not ready", async () => {
    vi.spyOn(aiService, "getCapabilities").mockResolvedValue({
      ok: true,
      data: { ...CAPS, ready: false },
    });
    renderWorkspace();
    expect(await screen.findByText(/no está listo/i)).toBeInTheDocument();
  });

  it("lists conversations and opens one on selection", async () => {
    vi.spyOn(aiService, "listConversations").mockResolvedValue({
      ok: true,
      data: page([listItem()]),
    });
    vi.spyOn(aiService, "getConversation").mockResolvedValue({
      ok: true,
      data: detail({ messages: [msg({ role: "assistant", content: "respuesta previa" })] }),
    });

    renderWorkspace();
    const railBtn = await screen.findByRole("button", { name: "Activos críticos" });
    await userEvent.click(railBtn);
    expect(replace).toHaveBeenCalledWith(expect.stringContaining("c=c1"), { scroll: false });
  });

  it("confirms before deleting a conversation", async () => {
    vi.spyOn(aiService, "listConversations").mockResolvedValue({
      ok: true,
      data: page([listItem()]),
    });
    const del = vi
      .spyOn(aiService, "deleteConversation")
      .mockResolvedValue({ ok: true, data: null });

    renderWorkspace();
    await screen.findByRole("button", { name: "Activos críticos" });
    await userEvent.click(screen.getByRole("button", { name: /eliminar conversación/i }));

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /^eliminar$/i }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("c1"));
  });

  it("shows a context banner when entering from an asset", async () => {
    mockSearchParams = new URLSearchParams("c=c1");
    vi.spyOn(aiService, "getConversation").mockResolvedValue({
      ok: true,
      data: detail({
        context: { type: "asset", id: "a1", label: "prod-api-01", available: true },
      }),
    });
    renderWorkspace();
    expect(await screen.findByText(/contexto: prod-api-01/i)).toBeInTheDocument();
  });

  it("surfaces a not-found error for a conversation that is not the user's", async () => {
    mockSearchParams = new URLSearchParams("c=zzz");
    vi.spyOn(aiService, "getConversation").mockResolvedValue({
      ok: false,
      error: { kind: "not_found" },
    });
    renderWorkspace();
    expect(await screen.findByText(/no se pudo cargar la conversación/i)).toBeInTheDocument();
  });
});
