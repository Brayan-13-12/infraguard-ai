"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { AskAiButton } from "@/components/ai/AskAiButton";
import { RelatedIncidents } from "@/components/incidents/RelatedIncidents";
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
import { ArrowLeftIcon, TrashIcon } from "@/components/ui/icons";
import { LANGUAGE_LOCALES, useTranslation, type TranslationKey } from "@/i18n";
import { ASSET_LIMITS } from "@/lib/config";
import { notifyAssetsChanged } from "@/lib/assetsRefresh";
import { notifyTrashChanged } from "@/lib/trashRefresh";
import { isValidIpAddress } from "@/lib/assetValidation";
import { deactivateAsset, deleteAsset, reactivateAsset, updateAsset } from "@/services/assets";
import type { Asset, AssetUpdateInput } from "@/types/asset";

import { AssetStatusBadge, CriticalityBadge } from "./AssetBadges";
import {
  assetTypeLabel,
  assetTypeOptions,
  criticalityOptions,
  environmentLabel,
  environmentOptions,
  statusOptions,
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

type AssetFieldKey =
  | "name"
  | "asset_type"
  | "environment"
  | "criticality"
  | "status"
  | "hostname"
  | "ip_address"
  | "owner"
  | "description";

interface FieldConfig {
  title: string;
  kind: FieldEditKind;
  initialValue: string;
  options?: { value: string; label: string }[];
  optional?: boolean;
  maxLength?: number;
  size?: "sm" | "md";
  validate?: (v: string) => string | null;
}

/**
 * Deactivate / reactivate behind a {@link ConfirmDialog}. On success it reports
 * the updated asset, tells the inventory list to refetch, and toasts. Shared by
 * the detail workspace footer and the full page.
 */
export function AssetLifecycleButton({
  asset,
  onChanged,
  size = "sm",
}: {
  asset: Asset;
  onChanged: (asset: Asset) => void;
  size?: "sm" | "md";
}) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = asset.is_active;

  async function run() {
    setBusy(true);
    setError(null);
    const res = active ? await deactivateAsset(asset.id) : await reactivateAsset(asset.id);
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      onChanged(res.data);
      notifyAssetsChanged();
      toast({
        tone: active ? "warning" : "success",
        description: active
          ? t("assetDetail.deactivatedToast")
          : t("assetDetail.reactivatedToast"),
      });
    } else {
      setError(t("assetDetail.actionError"));
    }
  }

  // Lifecycle state is part of "editing" an asset - hidden without assets.update.
  if (!can("assets.update")) return null;

  return (
    <>
      <Button
        variant={active ? "secondary" : "primary"}
        size={size}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {active ? t("assetDetail.deactivate") : t("assetDetail.reactivate")}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => void run()}
        title={active ? t("assetDetail.deactivate") : t("assetDetail.reactivate")}
        description={
          active ? t("assetDetail.deactivateConfirm") : t("assetDetail.reactivateConfirm")
        }
        confirmLabel={t("assetDetail.confirm")}
        cancelLabel={t("assetForm.cancel")}
        tone={active ? "danger" : "primary"}
        loading={busy}
        error={error}
      />
    </>
  );
}

/**
 * "Move to Trash" - a restrained, non-primary destructive action (soft delete).
 * Behind a {@link ConfirmDialog}. On success it tells the inventory + Trash
 * lists to refetch, toasts, and calls `onDeleted` (the workspace closes / the
 * full page navigates away). Recoverable from `/trash`; there is no permanent
 * delete here.
 */
export function MoveToTrashButton({
  asset,
  onDeleted,
  size = "sm",
}: {
  asset: Asset;
  onDeleted: () => void;
  size?: "sm" | "md";
}) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const res = await deleteAsset(asset.id);
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      notifyAssetsChanged();
      notifyTrashChanged({ scope: "assets" });
      toast({ tone: "warning", description: t("assetDetail.movedToTrashToast") });
      onDeleted();
    } else {
      setError(t("assetDetail.moveToTrashError"));
    }
  }

  if (!can("assets.delete")) return null;

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
        {t("assetDetail.moveToTrash")}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => void run()}
        title={t("assetDetail.moveToTrashTitle")}
        description={t("assetDetail.moveToTrashBody", { name: asset.name })}
        confirmLabel={t("assetDetail.moveToTrashConfirm")}
        cancelLabel={t("assetForm.cancel")}
        tone="danger"
        loading={busy}
        error={error}
      />
    </>
  );
}

/** Compact badge cluster for the workspace / page header. */
export function AssetDetailBadges({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{assetTypeLabel(t, asset.asset_type)}</span>
      <span aria-hidden="true" className="text-muted-foreground/40">
        ·
      </span>
      <CriticalityBadge value={asset.criticality} />
      <AssetStatusBadge value={asset.status} />
      {!asset.is_active ? (
        <Badge tone="neutral" className="text-[10px]">
          {t("assets.inactiveBadge")}
        </Badge>
      ) : null}
    </div>
  );
}

/**
 * The tabbed, inline-editable asset detail body. Powers both the intercepted
 * centered workspace and the full-page fallback - one implementation.
 */
export function AssetDetailContent({
  asset,
  onChanged,
}: {
  asset: Asset;
  onChanged: (asset: Asset) => void;
}) {
  const { t, language } = useTranslation();
  const { can } = useAuth();
  const canEdit = can("assets.update");
  const locale = LANGUAGE_LOCALES[language];
  const idBase = useTabsId("asset-detail");

  const TAB_KEYS: { id: string; labelKey: TranslationKey }[] = [
    { id: "summary", labelKey: "assetDetail.tabs.summary" },
    { id: "technical", labelKey: "assetDetail.tabs.technical" },
    { id: "incidents", labelKey: "assetDetail.tabs.incidents" },
    { id: "activity", labelKey: "assetDetail.tabs.activity" },
  ];
  const [tab, setTab] = useState("summary");
  const [seen, setSeen] = useState<Set<string>>(new Set(["summary"]));
  const selectTab = (id: string) => {
    setTab(id);
    setSeen((s) => (s.has(id) ? s : new Set(s).add(id)));
  };
  const [editing, setEditing] = useState<AssetFieldKey | null>(null);

  const configs: Record<AssetFieldKey, FieldConfig> = useMemo(() => {
    const nameFor = (k: AssetFieldKey): TranslationKey =>
      (
        {
          name: "assetFields.name",
          asset_type: "assetFields.type",
          environment: "assetFields.environment",
          criticality: "assetFields.criticality",
          status: "assetFields.status",
          hostname: "assetFields.hostname",
          ip_address: "assetFields.ipAddress",
          owner: "assetFields.owner",
          description: "assetFields.description",
        } as const
      )[k];
    const editTitle = (k: AssetFieldKey) =>
      `${t("fieldEdit.editPrefix")} ${t(nameFor(k)).toLowerCase()}`;
    return {
      name: {
        title: editTitle("name"),
        kind: "text",
        initialValue: asset.name,
        maxLength: ASSET_LIMITS.name,
      },
      asset_type: {
        title: editTitle("asset_type"),
        kind: "select",
        initialValue: asset.asset_type,
        options: assetTypeOptions(t),
      },
      environment: {
        title: editTitle("environment"),
        kind: "select",
        initialValue: asset.environment,
        options: environmentOptions(t),
      },
      criticality: {
        title: editTitle("criticality"),
        kind: "select",
        initialValue: asset.criticality,
        options: criticalityOptions(t),
      },
      status: {
        title: editTitle("status"),
        kind: "select",
        initialValue: asset.status,
        options: statusOptions(t),
      },
      hostname: {
        title: editTitle("hostname"),
        kind: "text",
        initialValue: asset.hostname ?? "",
        optional: true,
        maxLength: ASSET_LIMITS.hostname,
      },
      ip_address: {
        title: editTitle("ip_address"),
        kind: "text",
        initialValue: asset.ip_address ?? "",
        optional: true,
        maxLength: ASSET_LIMITS.ipAddress,
        validate: (v) =>
          v && !isValidIpAddress(v) ? t("assetForm.errorIpInvalid") : null,
      },
      owner: {
        title: editTitle("owner"),
        kind: "text",
        initialValue: asset.owner ?? "",
        optional: true,
        maxLength: ASSET_LIMITS.owner,
      },
      description: {
        title: editTitle("description"),
        kind: "textarea",
        initialValue: asset.description ?? "",
        optional: true,
        size: "md",
        maxLength: ASSET_LIMITS.description,
      },
    };
  }, [asset, t]);

  async function saveField(field: AssetFieldKey, value: string): Promise<FieldSaveResult> {
    const patch = { [field]: value === "" ? null : value } as AssetUpdateInput;
    const res = await updateAsset(asset.id, patch);
    if (res.ok) {
      onChanged(res.data);
      notifyAssetsChanged();
      toast({ tone: "success", description: t("assetForm.updatedToast") });
      return { ok: true };
    }
    const fieldError = res.error.kind === "validation" ? res.error.fields?.[field] : undefined;
    if (fieldError) return { ok: false, error: fieldError };
    if (res.error.kind === "not_found")
      return { ok: false, error: t("assetForm.errorNotFound") };
    if (res.error.kind === "unreachable")
      return { ok: false, error: t("assetForm.errorUnreachable") };
    return { ok: false, error: t("assetForm.errorGeneric") };
  }

  const editRow = (field: AssetFieldKey) =>
    canEdit
      ? { onEdit: () => setEditing(field), editLabel: configs[field].title }
      : {};

  const activeCfg = editing ? configs[editing] : null;

  return (
    <div className="flex flex-col">
      <Tabs
        tabs={TAB_KEYS.map((x) => ({ id: x.id, label: t(x.labelKey) }))}
        value={tab}
        onChange={selectTab}
        idBase={idBase}
        className="sticky top-0 z-10 -mx-5 bg-surface px-5 sm:-mx-6 sm:px-6"
      />

      {!asset.is_active ? (
        <Alert tone="warning" className="mt-4">
          {t("assetDetail.inactiveNotice")}
        </Alert>
      ) : null}

      {/* Resumen */}
      <div {...tabPanelProps(idBase, "summary")} hidden={tab !== "summary"} className="pt-4">
        <dl className="-mt-1">
          <DetailRow label={t("assetFields.name")} {...editRow("name")}>
            {asset.name}
          </DetailRow>
          <DetailRow label={t("assetFields.type")} {...editRow("asset_type")}>
            {assetTypeLabel(t, asset.asset_type)}
          </DetailRow>
          <DetailRow label={t("assetFields.environment")} {...editRow("environment")}>
            {environmentLabel(t, asset.environment)}
          </DetailRow>
          <DetailRow label={t("assetFields.criticality")} {...editRow("criticality")}>
            <CriticalityBadge value={asset.criticality} />
          </DetailRow>
          <DetailRow label={t("assetFields.status")} {...editRow("status")}>
            <AssetStatusBadge value={asset.status} />
          </DetailRow>
          <DetailRow label={t("assetFields.owner")} {...editRow("owner")}>
            {asset.owner ?? <NotSet label={t("assetDetail.notSet")} />}
          </DetailRow>
          <DetailRow label={t("assetDetail.activeState")}>
            {asset.is_active ? t("common.active") : t("common.inactive")}
          </DetailRow>
          <DetailRow label={t("assetFields.description")} {...editRow("description")}>
            {asset.description ? (
              <span className="whitespace-pre-wrap">{asset.description}</span>
            ) : (
              <NotSet label={t("assetDetail.noDescription")} />
            )}
          </DetailRow>
        </dl>
      </div>

      {/* Información técnica */}
      <div {...tabPanelProps(idBase, "technical")} hidden={tab !== "technical"} className="pt-4">
        <dl className="-mt-1">
          <DetailRow label={t("assetFields.hostname")} {...editRow("hostname")}>
            {asset.hostname ?? <NotSet label={t("assetDetail.notSet")} />}
          </DetailRow>
          <DetailRow label={t("assetFields.ipAddress")} {...editRow("ip_address")}>
            {asset.ip_address ? (
              <code className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                {asset.ip_address}
              </code>
            ) : (
              <NotSet label={t("assetDetail.notSet")} />
            )}
          </DetailRow>
        </dl>
      </div>

      {/* Incidentes relacionados */}
      <div {...tabPanelProps(idBase, "incidents")} hidden={tab !== "incidents"} className="pt-4">
        {seen.has("incidents") ? <RelatedIncidents assetId={asset.id} /> : null}
      </div>

      {/* Actividad */}
      <div {...tabPanelProps(idBase, "activity")} hidden={tab !== "activity"} className="pt-4">
        <dl className="-mt-1">
          <DetailRow label={t("assetFields.created")}>
            {formatDateTime(asset.created_at, locale)}
          </DetailRow>
          <DetailRow label={t("assetFields.updated")}>
            {formatDateTime(asset.updated_at, locale)}
          </DetailRow>
          <DetailRow label={t("assetFields.id")}>
            <code className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              {asset.id}
            </code>
          </DetailRow>
        </dl>
        <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-center">
          <p className="text-sm font-medium text-foreground">{t("assetDetail.futureTitle")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("assetDetail.futureBody")}</p>
          <Badge tone="neutral" className="mt-2 text-[10px]">
            {t("a11y.comingSoon")}
          </Badge>
        </div>
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
          validate={activeCfg.validate}
          onSave={(v) => saveField(editing, v)}
        />
      ) : null}
    </div>
  );
}

/** Full-page asset detail - the deep-link / refresh fallback for the workspace. */
export function AssetDetail({
  asset,
  onChanged,
  onDeleted,
}: {
  asset: Asset;
  onChanged: (asset: Asset) => void;
  /** Called after a successful "Move to Trash" (the page navigates to /assets). */
  onDeleted?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <Link
        href="/assets"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ArrowLeftIcon />
        {t("assetDetail.backToList")}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {asset.name}
          </h1>
          <div className="mt-2">
            <AssetDetailBadges asset={asset} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AskAiButton entity={{ type: "asset", id: asset.id }} />
          <MoveToTrashButton asset={asset} onDeleted={onDeleted ?? (() => {})} />
          <AssetLifecycleButton asset={asset} onChanged={onChanged} />
        </div>
      </header>

      <div className="rounded-xl border border-border bg-surface p-5 sm:p-6">
        <AssetDetailContent asset={asset} onChanged={onChanged} />
      </div>
    </div>
  );
}
