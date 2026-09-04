"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { PanelLeftIcon, SparklesIcon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";
import { useTranslation, type TranslationKey } from "@/i18n";
import { cn } from "@/lib/cn";
import { AI_MESSAGE_MAX_LENGTH } from "@/lib/config";
import * as aiService from "@/services/ai";
import type {
  AICapabilities,
  AIConversationContext,
  AIConversationDetail,
  AIConversationListItem,
  AIMessage,
} from "@/types/ai";

import { Composer } from "./Composer";
import { ContextBanner } from "./ContextBanner";
import { ConversationRail } from "./ConversationRail";
import { MessageBubble } from "./MessageBubble";
import { SuggestedPrompts } from "./SuggestedPrompts";

const ERROR_KEY: Record<string, TranslationKey> = {
  unreachable: "ai.errors.unreachable",
  forbidden: "ai.errors.forbidden",
  not_found: "ai.errors.notFound",
  rate_limited: "ai.errors.rateLimited",
  provider_unavailable: "ai.errors.providerUnavailable",
  provider_timeout: "ai.errors.providerTimeout",
  validation: "ai.errors.send",
  unexpected: "ai.errors.send",
};

type ActiveState =
  | { kind: "empty" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; detail: AIConversationDetail };

function useIsDesktop() {
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}

export function AiWorkspace() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const isDesktop = useIsDesktop();

  const activeId = params.get("c");
  const assetCtx = params.get("asset_id");
  const incidentCtx = params.get("incident_id");

  const [caps, setCaps] = useState<AICapabilities | null>(null);
  const [conversations, setConversations] = useState<AIConversationListItem[]>([]);
  const [convLoading, setConvLoading] = useState(true);
  const [active, setActive] = useState<ActiveState>({ kind: "empty" });
  const [pending, setPending] = useState<AIMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [toDelete, setToDelete] = useState<AIConversationListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  // The conversation id currently represented by `active`. When it matches
  // `activeId` the load effect skips its refetch - this is what stops a
  // just-created conversation from being re-fetched (a race that used to
  // double-count the turn and render the user message twice).
  const loadedIdRef = useRef<string | null>(null);
  const maxLen = caps?.message_max_length ?? AI_MESSAGE_MAX_LENGTH;

  // --- data loads ------------------------------------------------------

  const loadConversations = useCallback(async () => {
    setConvLoading(true);
    const res = await aiService.listConversations();
    setConvLoading(false);
    if (res.ok) setConversations(res.data.items);
  }, []);

  useEffect(() => {
    void aiService.getCapabilities().then((r) => {
      if (r.ok) setCaps(r.data);
    });
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!activeId) {
      loadedIdRef.current = null;
      setActive({ kind: "empty" });
      setPending(null);
      return;
    }
    // We already hold this conversation in state (e.g. we just created it, or
    // just reconciled a turn) - don't refetch and race our own local update.
    if (loadedIdRef.current === activeId) return;

    let cancelled = false;
    setActive({ kind: "loading" });
    setPending(null);
    setSendError(null);
    void aiService.getConversation(activeId).then((r) => {
      if (cancelled) return;
      loadedIdRef.current = r.ok ? activeId : null;
      setActive(r.ok ? { kind: "ready", detail: r.data } : { kind: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  // Auto-scroll to the newest message.
  const messages = active.kind === "ready" ? active.detail.messages : [];
  useEffect(() => {
    const el = scrollRef.current;
    if (el && typeof el.scrollTo === "function") {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length, pending, sending]);

  // --- navigation helpers -------------------------------------------

  const setUrl = useCallback(
    (next: { c?: string | null; asset_id?: string | null; incident_id?: string | null }) => {
      const qs = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v) qs.set(k, v);
        else qs.delete(k);
      }
      const s = qs.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const startNew = useCallback(() => {
    setUrl({ c: null, asset_id: null, incident_id: null });
    setActive({ kind: "empty" });
    setRailOpen(false);
  }, [setUrl]);

  const selectConversation = useCallback(
    (id: string) => {
      setUrl({ c: id, asset_id: null, incident_id: null });
      setRailOpen(false);
    },
    [setUrl],
  );

  // --- send ---------------------------------------------------------

  const send = useCallback(
    async (text: string) => {
      if (sending) return;
      setSending(true);
      setSendError(null);
      setLastSent(text);
      // One client-only optimistic user bubble, rendered separately from the
      // persisted messages. It is cleared only when the canonical server
      // messages take its place (success) - never duplicated alongside them.
      setPending({
        id: `optimistic-${Date.now()}`,
        role: "user",
        content: text,
        created_at: new Date().toISOString(),
        evidence: [],
        entities: [],
        suggestions: [],
      });

      let conversationId = activeId;
      if (!conversationId) {
        const ctx = assetCtx
          ? { asset_id: assetCtx }
          : incidentCtx
            ? { incident_id: incidentCtx }
            : undefined;
        const created = await aiService.createConversation(ctx ? { context: ctx } : {});
        if (!created.ok) {
          setSending(false);
          setPending(null);
          setSendError(t(ERROR_KEY[created.error.kind] ?? "ai.errors.send"));
          return;
        }
        conversationId = created.data.id;
        // Claim the conversation BEFORE the URL change so the load effect does
        // not refetch it and race this turn's local reconciliation.
        loadedIdRef.current = conversationId;
        setActive({ kind: "ready", detail: created.data });
        setUrl({ c: conversationId, asset_id: null, incident_id: null });
      }

      const res = await aiService.sendMessage(conversationId, text);
      setSending(false);

      if (!res.ok) {
        // Keep the optimistic user bubble on screen - the turn is not lost, it
        // is retryable. The backend keeps the user message too, and sweeps it
        // when the retry regenerates the turn (no duplicate).
        setSendError(res.error.message ?? t(ERROR_KEY[res.error.kind] ?? "ai.errors.send"));
        return;
      }

      setPending(null);
      loadedIdRef.current = conversationId;
      setActive((prev) => {
        if (prev.kind !== "ready" || prev.detail.id !== conversationId) return prev;
        // Mirror the backend: a trailing unanswered user message (left by a
        // previous failed turn we later reopened) is replaced by this turn.
        const msgs = prev.detail.messages;
        const last = msgs[msgs.length - 1];
        const base = last && last.role === "user" ? msgs.slice(0, -1) : msgs;
        return {
          kind: "ready",
          detail: {
            ...prev.detail,
            title: res.data.title,
            updated_at: new Date().toISOString(),
            messages: [...base, res.data.user_message, res.data.assistant_message],
          },
        };
      });
      setLastSent(null);
      void loadConversations();
    },
    [activeId, assetCtx, incidentCtx, sending, setUrl, loadConversations, t],
  );

  const confirmDelete = useCallback(async () => {
    if (!toDelete) return;
    setDeleting(true);
    const res = await aiService.deleteConversation(toDelete.id);
    setDeleting(false);
    if (!res.ok) {
      toast({ tone: "danger", description: t("ai.errors.send") });
      return;
    }
    toast({ tone: "success", description: t("ai.deletedToast") });
    if (toDelete.id === activeId) startNew();
    setToDelete(null);
    void loadConversations();
  }, [toDelete, activeId, startNew, loadConversations, t]);

  // --- context for the empty state --------------------------------

  const emptyContext: AIConversationContext | null = useMemo(() => {
    if (assetCtx) return { type: "asset", id: assetCtx, label: assetCtx, available: true };
    if (incidentCtx) return { type: "incident", id: incidentCtx, label: incidentCtx, available: true };
    return null;
  }, [assetCtx, incidentCtx]);

  const bannerContext = active.kind === "ready" ? active.detail.context : null;
  const promptContext = bannerContext ?? emptyContext;

  const contextPrompts = useMemo(() => {
    if (!promptContext) return undefined;
    return promptContext.type === "asset"
      ? [
          t("ai.contextSuggestions.assetSummary"),
          t("ai.contextSuggestions.assetIncidents"),
          t("ai.contextSuggestions.assetChanges"),
        ]
      : [
          t("ai.contextSuggestions.incidentSummary"),
          t("ai.contextSuggestions.incidentAssets"),
          t("ai.contextSuggestions.incidentTimeline"),
        ];
  }, [promptContext, t]);

  // --- render -----------------------------------------------------

  const rail = (
    <ConversationRail
      conversations={conversations}
      activeId={activeId}
      loading={convLoading}
      onSelect={selectConversation}
      onNew={startNew}
      onDelete={setToDelete}
    />
  );

  const conversationBody = (() => {
    if (active.kind === "loading") {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      );
    }
    if (active.kind === "error") {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-muted-foreground">{t("ai.errors.loadConversation")}</p>
          <Button variant="secondary" size="sm" onClick={() => activeId && selectConversation(activeId)}>
            {t("ai.errors.retry")}
          </Button>
        </div>
      );
    }
    // Empty state only while nothing is happening - as soon as a turn starts
    // (optimistic bubble / thinking) switch to the conversation layout so the
    // message does not jump from the centred empty state to the top.
    if (messages.length === 0 && !pending && !sending) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
          <div className="flex flex-col items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <SparklesIcon className="h-6 w-6" />
            </span>
            <h2 className="text-lg font-semibold text-foreground">{t("ai.empty.title")}</h2>
            <p className="max-w-md text-sm text-muted-foreground">{t("ai.empty.subtitle")}</p>
          </div>
          <SuggestedPrompts onPick={send} prompts={contextPrompts} />
        </div>
      );
    }
    return (
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-6 sm:px-6">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} onSuggestion={send} />
        ))}
        {pending ? (
          <div className={cn(sendError && "opacity-60")}>
            <MessageBubble message={pending} />
          </div>
        ) : null}
        {sending ? (
          <div className="flex items-center gap-2 pl-10 text-xs text-muted-foreground">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
            </span>
            {t("ai.thinking")}
          </div>
        ) : null}
      </div>
    );
  })();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {!isDesktop ? (
            <Button
              variant="ghost"
              size="sm"
              aria-label={t("ai.conversations")}
              onClick={() => setRailOpen(true)}
            >
              <PanelLeftIcon className="h-4 w-4" />
            </Button>
          ) : null}
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
              {t("ai.title")}
              <Badge tone="info">{t("ai.readOnlyBadge")}</Badge>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("ai.subtitle")}</p>
          </div>
        </div>
      </div>

      {caps && !caps.ready ? (
        <Alert tone="warning">{t("ai.providerNotReady")}</Alert>
      ) : null}

      <div
        className={cn(
          "flex overflow-hidden rounded-xl border border-border bg-background",
          "h-[calc(100dvh-13rem)] min-h-[30rem] sm:h-[calc(100dvh-15rem)]",
        )}
      >
        {isDesktop ? (
          <aside className="w-64 shrink-0 border-r border-border bg-surface">{rail}</aside>
        ) : (
          <Drawer
            open={railOpen}
            onClose={() => setRailOpen(false)}
            side="left"
            label={t("ai.conversations")}
            className="w-[85vw] max-w-sm"
          >
            {rail}
          </Drawer>
        )}

        <section className="flex min-w-0 flex-1 flex-col">
          {bannerContext ? <ContextBanner context={bannerContext} /> : null}
          {conversationBody}
          {sendError ? (
            <div className="border-t border-border bg-danger/5 px-4 py-2 sm:px-6">
              <div className="flex items-center justify-between gap-3 text-sm text-danger">
                <span>{sendError}</span>
                {lastSent ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger hover:bg-danger/10"
                    onClick={() => send(lastSent)}
                  >
                    {t("ai.errors.retry")}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          <Composer
            onSend={send}
            sending={sending}
            disabled={!can("ai.use") || (caps ? !caps.ready : false) || active.kind === "loading"}
            maxLength={maxLen}
            autoFocus={isDesktop}
          />
        </section>
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => void confirmDelete()}
        title={t("ai.deleteConfirmTitle")}
        description={t("ai.deleteConfirmBody", { title: toDelete?.title ?? "" })}
        confirmLabel={t("ai.deleteConfirm")}
        tone="danger"
        loading={deleting}
      />
    </div>
  );
}
