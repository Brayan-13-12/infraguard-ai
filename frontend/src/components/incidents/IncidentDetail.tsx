"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { AssetStatusBadge, CriticalityBadge } from "@/components/assets/AssetBadges";
import { assetTypeLabel, environmentLabel } from "@/components/assets/catalog";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DetailRow, NotSet } from "@/components/ui/DetailRow";
import {
  FieldEditDialog,
  type FieldEditKind,
  type FieldSaveResult,
} from "@/components/ui/FieldEditDialog";
import { Tabs, tabPanelProps, useTabsId } from "@/components/ui/Tabs";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { ArrowLeftIcon, PencilIcon, TrashIcon } from "@/components/ui/icons";
import { LANGUAGE_LOCALES, useTranslation, type TranslationKey } from "@/i18n";
import { INCIDENT_LIMITS } from "@/lib/config";
import { isoToLocalInput, localInputToIso } from "@/lib/datetime";
import { notifyIncidentsChanged } from "@/lib/incidentsRefresh";
import { notifyTrashChanged } from "@/lib/trashRefresh";
import {
  deleteIncident,
  reopenIncident,
  resolveIncident,
  updateIncident,
} from "@/services/incidents";
import type { AssetStatus, AssetType, Criticality, Environment } from "@/types/asset";
import {
  TERMINAL_INCIDENT_STATUSES,
  type IncidentDetail as IncidentDetailT,
  type IncidentUpdateInput,
} from "@/types/incident";

import { AffectedAssetsEditDialog } from "./AffectedAssetsEditDialog";
import { IncidentStatusBadge, PriorityBadge, SeverityBadge } from "./IncidentBadges";
import { IncidentTimeline } from "./IncidentTimeline";
import {
  incidentStatusOptions,
  priorityOptions,
  severityOptions,
} from "./catalog";

function formatDateTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type IncidentFieldKey =
  | "title"
  | "description"
  | "severity"
  | "status"
  | "priority"
  | "owner"
  | "started_at"
  | "detected_at";

interface FieldConfig {
  title: string;
  kind: FieldEditKind;
  initialValue: string;
  options?: { value: string; label: string }[];
  optional?: boolean;
  maxLength?: number;
  size?: "sm" | "md";
}

/** Affected-asset list. Asset names link into the existing Asset experience. */
export function IncidentAffectedAssets({ incident }: { incident: IncidentDetailT }) {
  const { t } = useTranslation();
  if (incident.affected_assets.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("incidentDetail.affectedEmpty")}</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-border">
      {incident.affected_assets.map((a) => (
        <li
          key={a.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 first:pt-0 last:pb-0"
        >
          <Link
            href={`/assets/${a.id}`}
            className="font-mono text-[13px] font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {a.name}
          </Link>
          <span className="text-xs text-muted-foreground">
            {assetTypeLabel(t, a.asset_type as AssetType)} ·{" "}
            {environmentLabel(t, a.environment as Environment)}
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            {a.deleted_at ? (
              <Badge tone="neutral" className="text-[10px]">
                {t("incidentDetail.assetInTrash")}
              </Badge>
            ) : null}
            <CriticalityBadge value={a.criticality as Criticality} />
            <AssetStatusBadge value={a.status as AssetStatus} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * "Move to Trash" - a restrained, non-primary destructive action (soft delete
 * of the incident; its timeline and affected-asset links are preserved). Behind
 * a {@link ConfirmDialog}. On success it refreshes the incident + Trash lists,
 * toasts and calls `onDeleted`. Recoverable from `/trash`.
 */
export function MoveIncidentToTrashButton({
  incident,
  onDeleted,
  size = "sm",
}: {
  incident: IncidentDetailT;
  onDeleted: () => void;
  size?: "sm" | "md";
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const res = await deleteIncident(incident.id);
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      notifyIncidentsChanged();
      notifyTrashChanged({ scope: "incidents" });
      toast({ tone: "warning", description: t("incidentDetail.movedToTrashToast") });
      onDeleted();
    } else {
      setError(t("incidentDetail.moveToTrashError"));
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size={size}
        className="text-danger hover:bg-danger/10 hover:text-danger"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <TrashIcon className="h-3.5 w-3.5" />
        {t("incidentDetail.moveToTrash")}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => void run()}
        title={t("incidentDetail.moveToTrashTitle")}
        description={t("incidentDetail.moveToTrashBody", { title: incident.title })}
        confirmLabel={t("incidentDetail.moveToTrashConfirm")}
        cancelLabel={t("incidentForm.cancel")}
        tone="danger"
        loading={busy}
        error={error}
      />
    </>
  );
}

/**
 * One contextual lifecycle action (Resolve for an active incident, Reopen for a
 * terminal one) behind a {@link ConfirmDialog}. Shared by the workspace footer
 * and the full page. The generic "Edit" affordance has been removed - editing is
 * inline, per field, from the detail body.
 */
export function IncidentLifecycleActions({
  incident,
  onChanged,
  size = "sm",
}: {
  incident: IncidentDetailT;
  onChanged: (incident: IncidentDetailT) => void;
  size?: "sm" | "md";
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isTerminal = TERMINAL_INCIDENT_STATUSES.includes(incident.status);

  async function run() {
    setBusy(true);
    setError(null);
    const res = isTerminal
      ? await reopenIncident(incident.id)
      : await resolveIncident(incident.id);
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      onChanged(res.data);
      notifyIncidentsChanged();
      toast({
        tone: isTerminal ? "info" : "success",
        description: isTerminal
          ? t("incidentDetail.reopenedToast")
          : t("incidentDetail.resolvedToast"),
      });
    } else {
      setError(t("incidentDetail.actionError"));
    }
  }

  return (
    <>
      <Button
        variant={isTerminal ? "secondary" : "primary"}
        size={size}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {isTerminal ? t("incidentDetail.reopen") : t("incidentDetail.resolve")}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => void run()}
        title={isTerminal ? t("incidentDetail.reopen") : t("incidentDetail.resolve")}
        description={
          isTerminal ? t("incidentDetail.reopenConfirm") : t("incidentDetail.resolveConfirm")
        }
        confirmLabel={t("incidentDetail.confirm")}
        cancelLabel={t("incidentForm.cancel")}
        tone="primary"
        loading={busy}
        error={error}
      />
    </>
  );
}

/** Badge cluster for the workspace / page header. */
export function IncidentDetailBadges({ incident }: { incident: IncidentDetailT }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <SeverityBadge value={incident.severity} />
      <IncidentStatusBadge value={incident.status} />
      <PriorityBadge value={incident.priority} />
    </div>
  );
}

/**
 * Tabbed, inline-editable incident detail body. Powers the intercepted centered
 * workspace and the full-page fallback - one implementation.
 */
export function IncidentDetailContent({
  incident,
  onChanged,
}: {
  incident: IncidentDetailT;
  onChanged: (incident: IncidentDetailT) => void;
}) {
  const { t, language } = useTranslation();
  const locale = LANGUAGE_LOCALES[language];
  const idBase = useTabsId("incident-detail");
  const isTerminal = TERMINAL_INCIDENT_STATUSES.includes(incident.status);

  const [tab, setTab] = useState("summary");
  const [seen, setSeen] = useState<Set<string>>(new Set(["summary"]));
  const selectTab = (id: string) => {
    setTab(id);
    setSeen((s) => (s.has(id) ? s : new Set(s).add(id)));
  };
  const [editing, setEditing] = useState<IncidentFieldKey | null>(null);
  const [editingAssets, setEditingAssets] = useState(false);

  const configs: Record<IncidentFieldKey, FieldConfig> = useMemo(() => {
    const nameFor = (k: IncidentFieldKey): TranslationKey =>
      (
        {
          title: "incidentFields.title",
          description: "incidentFields.description",
          severity: "incidentFields.severity",
          status: "incidentFields.status",
          priority: "incidentFields.priority",
          owner: "incidentFields.owner",
          started_at: "incidentFields.started",
          detected_at: "incidentFields.detected",
        } as const
      )[k];
    const editTitle = (k: IncidentFieldKey) =>
      `${t("fieldEdit.editPrefix")} ${t(nameFor(k)).toLowerCase()}`;
    return {
      title: {
        title: editTitle("title"),
        kind: "text",
        initialValue: incident.title,
        maxLength: INCIDENT_LIMITS.title,
      },
      description: {
        title: editTitle("description"),
        kind: "textarea",
        initialValue: incident.description ?? "",
        optional: true,
        size: "md",
        maxLength: INCIDENT_LIMITS.description,
      },
      severity: {
        title: editTitle("severity"),
        kind: "select",
        initialValue: incident.severity,
        options: severityOptions(t),
      },
      status: {
        title: editTitle("status"),
        kind: "select",
        initialValue: incident.status,
        options: incidentStatusOptions(t),
      },
      priority: {
        title: editTitle("priority"),
        kind: "select",
        initialValue: incident.priority,
        options: priorityOptions(t),
      },
      owner: {
        title: editTitle("owner"),
        kind: "text",
        initialValue: incident.owner ?? "",
        optional: true,
        maxLength: INCIDENT_LIMITS.owner,
      },
      started_at: {
        title: editTitle("started_at"),
        kind: "datetime",
        initialValue: isoToLocalInput(incident.started_at),
      },
      detected_at: {
        title: editTitle("detected_at"),
        kind: "datetime",
        initialValue: isoToLocalInput(incident.detected_at),
        optional: true,
      },
    };
  }, [incident, t]);

  async function persist(
    patch: IncidentUpdateInput,
    field?: IncidentFieldKey,
    toastKey: TranslationKey = "incidentForm.updatedToast",
  ): Promise<FieldSaveResult> {
    const res = await updateIncident(incident.id, patch);
    if (res.ok) {
      onChanged(res.data);
      notifyIncidentsChanged();
      toast({ tone: "success", description: t(toastKey) });
      return { ok: true };
    }
    const fieldError =
      field && res.error.kind === "validation" ? res.error.fields?.[field] : undefined;
    if (fieldError) return { ok: false, error: fieldError };
    if (res.error.kind === "not_found")
      return { ok: false, error: t("incidentForm.errorNotFound") };
    if (res.error.kind === "unreachable")
      return { ok: false, error: t("incidentForm.errorUnreachable") };
    return { ok: false, error: t("incidentForm.errorGeneric") };
  }

  async function saveField(
    field: IncidentFieldKey,
    value: string,
  ): Promise<FieldSaveResult> {
    // Status crossing the terminal boundary goes through the dedicated
    // lifecycle endpoints (which own the resolved_at + RESOLVED/REOPENED
    // semantics); every other transition is a plain PATCH (the backend still
    // generates the matching timeline event).
    if (field === "status") {
      if (value === "Resolved" && !isTerminal) {
        const res = await resolveIncident(incident.id);
        if (res.ok) {
          onChanged(res.data);
          notifyIncidentsChanged();
          toast({ tone: "success", description: t("incidentDetail.resolvedToast") });
          return { ok: true };
        }
        return { ok: false, error: t("incidentDetail.actionError") };
      }
      if (value === "Open" && isTerminal) {
        const res = await reopenIncident(incident.id);
        if (res.ok) {
          onChanged(res.data);
          notifyIncidentsChanged();
          toast({ tone: "info", description: t("incidentDetail.reopenedToast") });
          return { ok: true };
        }
        return { ok: false, error: t("incidentDetail.actionError") };
      }
      return persist({ status: value as IncidentUpdateInput["status"] }, "status");
    }

    if (field === "started_at" || field === "detected_at") {
      return persist({ [field]: localInputToIso(value) }, field);
    }
    const patch = { [field]: value === "" ? null : value } as IncidentUpdateInput;
    return persist(patch, field);
  }

  const editRow = (field: IncidentFieldKey) => ({
    onEdit: () => setEditing(field),
    editLabel: configs[field].title,
  });

  const activeCfg = editing ? configs[editing] : null;
  const affectedCount = incident.affected_assets.length;

  const TAB_DEFS = [
    { id: "summary", label: t("incidentDetail.tabs.summary") },
    {
      id: "affected",
      label: t("incidentDetail.tabs.affected"),
      badge: affectedCount,
    },
    { id: "timeline", label: t("incidentDetail.tabs.timeline") },
    { id: "activity", label: t("incidentDetail.tabs.activity") },
  ];

  return (
    <div className="flex flex-col">
      <Tabs
        tabs={TAB_DEFS}
        value={tab}
        onChange={selectTab}
        idBase={idBase}
        className="sticky top-0 z-10 -mx-5 bg-surface px-5 sm:-mx-6 sm:px-6"
      />

      {isTerminal ? (
        <Alert tone="success" className="mt-4">
          {t("incidentDetail.resolvedNotice")}
        </Alert>
      ) : null}

      {/* Resumen */}
      <div {...tabPanelProps(idBase, "summary")} hidden={tab !== "summary"} className="pt-4">
        <dl className="-mt-1">
          <DetailRow label={t("incidentFields.title")} {...editRow("title")}>
            {incident.title}
          </DetailRow>
          <DetailRow label={t("incidentFields.severity")} {...editRow("severity")}>
            <SeverityBadge value={incident.severity} />
          </DetailRow>
          <DetailRow label={t("incidentFields.status")} {...editRow("status")}>
            <IncidentStatusBadge value={incident.status} />
          </DetailRow>
          <DetailRow label={t("incidentFields.priority")} {...editRow("priority")}>
            <PriorityBadge value={incident.priority} />
          </DetailRow>
          <DetailRow label={t("incidentFields.owner")} {...editRow("owner")}>
            {incident.owner ?? <NotSet label={t("incidentDetail.notSet")} />}
          </DetailRow>
          <DetailRow label={t("incidentFields.started")} {...editRow("started_at")}>
            {formatDateTime(incident.started_at, locale)}
          </DetailRow>
          <DetailRow label={t("incidentFields.detected")} {...editRow("detected_at")}>
            {incident.detected_at ? (
              formatDateTime(incident.detected_at, locale)
            ) : (
              <NotSet label={t("incidentDetail.notSet")} />
            )}
          </DetailRow>
          <DetailRow label={t("incidentFields.resolved")}>
            {incident.resolved_at ? (
              formatDateTime(incident.resolved_at, locale)
            ) : (
              <NotSet label={t("incidentDetail.notSet")} />
            )}
          </DetailRow>
          <DetailRow label={t("incidentFields.description")} {...editRow("description")}>
            {incident.description ? (
              <span className="whitespace-pre-wrap">{incident.description}</span>
            ) : (
              <NotSet label={t("incidentDetail.noDescription")} />
            )}
          </DetailRow>
        </dl>
      </div>

      {/* Activos afectados */}
      <div {...tabPanelProps(idBase, "affected")} hidden={tab !== "affected"} className="pt-4">
        <div className="mb-3 flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => setEditingAssets(true)}>
            <PencilIcon className="h-3.5 w-3.5" />
            {t("incidentDetail.editAffected")}
          </Button>
        </div>
        <IncidentAffectedAssets incident={incident} />
      </div>

      {/* Timeline */}
      <div {...tabPanelProps(idBase, "timeline")} hidden={tab !== "timeline"} className="pt-4">
        {seen.has("timeline") ? <IncidentTimeline events={incident.timeline} /> : null}
      </div>

      {/* Actividad */}
      <div {...tabPanelProps(idBase, "activity")} hidden={tab !== "activity"} className="pt-4">
        <dl className="-mt-1">
          <DetailRow label={t("incidentFields.created")}>
            {formatDateTime(incident.created_at, locale)}
          </DetailRow>
          <DetailRow label={t("incidentFields.updated")}>
            {formatDateTime(incident.updated_at, locale)}
          </DetailRow>
          <DetailRow label={t("incidentDetail.createdBy")}>
            <code className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              {incident.created_by}
            </code>
          </DetailRow>
          <DetailRow label={t("incidentFields.id")}>
            <code className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              {incident.id}
            </code>
          </DetailRow>
        </dl>
      </div>

      {activeCfg && editing ? (
        <FieldEditDialog
          key={editing}
          open
          onClose={() => setEditing(null)}
          title={activeCfg.title}
          kind={activeCfg.kind}
          initialValue={activeCfg.initialValue}
          options={activeCfg.options}
          optional={activeCfg.optional}
          maxLength={activeCfg.maxLength}
          size={activeCfg.size}
          onSave={(v) => saveField(editing, v)}
        />
      ) : null}

      {editingAssets ? (
        <AffectedAssetsEditDialog
          incident={incident}
          onClose={() => setEditingAssets(false)}
          onSave={(assetIds) =>
            persist({ asset_ids: assetIds }, undefined, "incidentDetail.affectedUpdatedToast")
          }
        />
      ) : null}
    </div>
  );
}

/** Full-page incident detail - the deep-link / refresh fallback for the workspace. */
export function IncidentDetail({
  incident,
  onChanged,
  onDeleted,
}: {
  incident: IncidentDetailT;
  onChanged: (incident: IncidentDetailT) => void;
  /** Called after a successful "Move to Trash" (the page navigates to /incidents). */
  onDeleted?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <Link
        href="/incidents"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ArrowLeftIcon />
        {t("incidentDetail.backToList")}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {incident.title}
          </h1>
          <div className="mt-2">
            <IncidentDetailBadges incident={incident} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MoveIncidentToTrashButton incident={incident} onDeleted={onDeleted ?? (() => {})} />
          <IncidentLifecycleActions incident={incident} onChanged={onChanged} />
        </div>
      </header>

      <div className="rounded-xl border border-border bg-surface p-5 sm:p-6">
        <IncidentDetailContent incident={incident} onChanged={onChanged} />
      </div>
    </div>
  );
}
