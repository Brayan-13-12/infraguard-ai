"use client";

import Link from "next/link";

import { NotSet } from "@/components/ui/DetailRow";
import { ArrowLeftIcon, ArrowRightIcon } from "@/components/ui/icons";
import { LANGUAGE_LOCALES, useTranslation } from "@/i18n";
import { cn } from "@/lib/cn";
import {
  auditEntityHref,
  isInlinePreviewable,
  isLifecycleOnlyAction,
  type AuditChange,
  type AuditEventDetail,
} from "@/types/audit";

import { AuditActionIcon } from "./AuditActionIcon";
import { prettyFieldName } from "./AuditChangePreview";
import { auditActionLabel, auditEntityLabel, auditEventTitle } from "./catalog";

type T = ReturnType<typeof useTranslation>["t"];

function formatDateTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
      {children}
    </code>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-border py-3 last:border-0 sm:grid-cols-[minmax(0,160px)_1fr] sm:items-baseline sm:gap-5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

/** Compact header used by both the workspace dialog and the full page. */
export function AuditEventHeader({ event }: { event: AuditEventDetail }) {
  const { t, language } = useTranslation();
  const locale = LANGUAGE_LOCALES[language];
  const title = auditEventTitle(t, event.action, event.entity_type);
  const isAuth = isLifecycleOnlyAction(event.action);

  return (
    <div className="flex items-start gap-3">
      <AuditActionIcon action={event.action} />
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
          {title}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {!isAuth ? (
            <>
              <span>{auditEntityLabel(t, event.entity_type)}</span>
              {event.entity_label ? (
                <>
                  {" · "}
                  <span className="font-mono">{event.entity_label}</span>
                </>
              ) : null}
              {" — "}
            </>
          ) : null}
          {formatDateTime(event.occurred_at, locale)}
        </p>
      </div>
    </div>
  );
}

/** Human title string for accessible names / the browser tab. */
export function auditEventLabel(t: T, event: AuditEventDetail): string {
  return auditEventTitle(t, event.action, event.entity_type);
}

function OldNewValue({ value, strong }: { value: string | null; strong?: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-sm",
        strong
          ? "bg-surface-elevated font-medium text-foreground ring-1 ring-border"
          : "bg-muted/60 text-muted-foreground",
      )}
    >
      {value ?? t("auditDetail.emptyValue")}
    </span>
  );
}

function ChangeBlock({ change }: { change: AuditChange }) {
  const { t } = useTranslation();
  const field = prettyFieldName(change.field_name);
  const inline = isInlinePreviewable(change);

  return (
    <div className="border-b border-border py-3 last:border-0">
      <p className="mb-1.5 text-sm font-medium text-foreground">{field}</p>
      {inline ? (
        <div className="flex flex-wrap items-center gap-2">
          <OldNewValue value={change.old_value} />
          <ArrowRightIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
          <OldNewValue value={change.new_value} strong />
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("auditDetail.beforeColumn")}
            </p>
            <div className="whitespace-pre-wrap rounded-md bg-muted/60 p-2.5 text-sm text-muted-foreground">
              {change.old_value ?? t("auditDetail.emptyValue")}
            </div>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("auditDetail.afterColumn")}
            </p>
            <div className="whitespace-pre-wrap rounded-md bg-surface-elevated p-2.5 text-sm text-foreground ring-1 ring-border">
              {change.new_value ?? t("auditDetail.emptyValue")}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChangesSection({ event }: { event: AuditEventDetail }) {
  const { t } = useTranslation();

  // LOGIN / LOGOUT never carry field changes - no section, not even a note.
  if (isLifecycleOnlyAction(event.action)) return null;

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-foreground">
        {t("auditDetail.changesTitle")}
      </h3>
      {event.changes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("auditDetail.changesEmpty")}</p>
      ) : (
        <div className="rounded-lg border border-border px-3">
          {event.changes.map((c) => (
            <ChangeBlock key={c.field_name} change={c} />
          ))}
        </div>
      )}
    </section>
  );
}

function Metadata({ event }: { event: AuditEventDetail }) {
  const { t } = useTranslation();
  const entries = event.metadata ? Object.entries(event.metadata) : [];
  if (entries.length === 0) return null;

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-foreground">
        {t("auditDetail.metadataTitle")}
      </h3>
      <dl className="rounded-lg border border-border">
        {entries.map(([key, value]) => (
          <div
            key={key}
            className="grid gap-1 border-b border-border px-3 py-2 last:border-0 sm:grid-cols-[minmax(0,180px)_1fr] sm:gap-4"
          >
            <dt className="text-xs text-muted-foreground">{prettyFieldName(key)}</dt>
            <dd className="min-w-0 break-words text-sm text-foreground">
              {typeof value === "object"
                ? JSON.stringify(value)
                : String(value as string | number | boolean)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * The audit event body: an overview block, the field-change section (prominent,
 * right after the overview), the request context, then any structured metadata.
 * One implementation for the intercepted workspace and the full page.
 */
export function AuditDetailContent({ event }: { event: AuditEventDetail }) {
  const { t, language } = useTranslation();
  const locale = LANGUAGE_LOCALES[language];
  const href = auditEntityHref(event.entity_type, event.entity_id);
  const isAuth = isLifecycleOnlyAction(event.action);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="mb-1 text-sm font-semibold text-foreground">
          {t("auditDetail.overview")}
        </h3>
        <dl>
          <Row label={t("auditFields.actor")}>
            {event.actor_email ?? <NotSet label={t("audit.system")} />}
          </Row>
          <Row label={t("auditFields.occurredAt")}>
            {formatDateTime(event.occurred_at, locale)}
          </Row>
          <Row label={t("auditFields.action")}>{auditActionLabel(t, event.action)}</Row>
          <Row label={t("auditFields.entity")}>
            <span className="flex flex-wrap items-center gap-2">
              <span>{auditEntityLabel(t, event.entity_type)}</span>
              {event.entity_label ? (
                <span className="text-muted-foreground">· {event.entity_label}</span>
              ) : null}
              {href ? (
                <Link
                  href={href}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {t("auditDetail.viewEntity", {
                    entity: auditEntityLabel(t, event.entity_type).toLowerCase(),
                  })}
                  <ArrowRightIcon className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </span>
          </Row>
        </dl>
      </section>

      <ChangesSection event={event} />

      <section>
        <h3 className="mb-1 text-sm font-semibold text-foreground">
          {t("auditDetail.contextTitle")}
        </h3>
        <dl>
          {!isAuth ? (
            <Row label={t("auditFields.entityId")}>
              {event.entity_id ? (
                <Code>{event.entity_id}</Code>
              ) : (
                <NotSet label={t("auditFields.notSet")} />
              )}
            </Row>
          ) : null}
          <Row label={t("auditFields.requestId")}>
            {event.request_id ? (
              <Code>{event.request_id}</Code>
            ) : (
              <NotSet label={t("auditFields.notSet")} />
            )}
          </Row>
          <Row label={t("auditFields.ipAddress")}>
            {event.ip_address ? (
              <Code>{event.ip_address}</Code>
            ) : (
              <NotSet label={t("auditFields.notSet")} />
            )}
          </Row>
          <Row label={t("auditFields.userAgent")}>
            {event.user_agent ? (
              <span className="break-words text-muted-foreground">{event.user_agent}</span>
            ) : (
              <NotSet label={t("auditFields.notSet")} />
            )}
          </Row>
        </dl>
      </section>

      <Metadata event={event} />

      <p className="text-xs text-muted-foreground">{t("auditDetail.appendOnlyNote")}</p>
    </div>
  );
}

/** Full-page audit event detail - the deep-link / refresh fallback. */
export function AuditDetail({ event }: { event: AuditEventDetail }) {
  const { t } = useTranslation();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <Link
        href="/audit"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ArrowLeftIcon />
        {t("auditDetail.backToList")}
      </Link>

      <header className="min-w-0">
        <AuditEventHeader event={event} />
      </header>

      <div className="rounded-xl border border-border bg-surface p-5 sm:p-6">
        <AuditDetailContent event={event} />
      </div>
    </div>
  );
}
