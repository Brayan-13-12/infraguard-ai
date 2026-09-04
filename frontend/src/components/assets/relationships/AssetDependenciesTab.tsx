"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { ArrowRightIcon, LinkIcon, NetworkIcon, PlusIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";
import { deleteRelationship, getAssetRelationships } from "@/services/relationships";
import type { Asset } from "@/types/asset";
import type { AssetRelationshipsGrouped, RelationshipDetail } from "@/types/relationship";
import { RELATIONSHIP_TYPES } from "@/types/relationship";

import { AddRelationshipDialog } from "./AddRelationshipDialog";
import { relationshipInverseLabel, relationshipTypeLabel, type T } from "./catalog";
import { EditRelationshipDialog } from "./EditRelationshipDialog";
import { RelationshipItem } from "./RelationshipItem";

type State =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; data: AssetRelationshipsGrouped };

interface Section {
  key: string;
  heading: string;
  items: RelationshipDetail[];
  direction: "outgoing" | "incoming";
}

function buildSections(t: T, data: AssetRelationshipsGrouped): Section[] {
  const sections: Section[] = [];
  for (const type of RELATIONSHIP_TYPES) {
    const outgoing = data.outgoing.filter((r) => r.relationship_type === type);
    if (outgoing.length > 0) {
      sections.push({
        key: `${type}-out`,
        heading: relationshipTypeLabel(t, type),
        items: outgoing,
        direction: "outgoing",
      });
    }
    const incoming = data.incoming.filter((r) => r.relationship_type === type);
    if (incoming.length > 0) {
      sections.push({
        key: `${type}-in`,
        heading: relationshipInverseLabel(t, type),
        items: incoming,
        direction: "incoming",
      });
    }
  }
  return sections;
}

export function AssetDependenciesTab({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const canManage = can("relationships.manage");
  const [state, setState] = useState<State>({ kind: "loading" });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<RelationshipDetail | null>(null);
  const [deleting, setDeleting] = useState<RelationshipDetail | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = () => {
    setState({ kind: "loading" });
    void getAssetRelationships(asset.id).then((res) => {
      setState(res.ok ? { kind: "ready", data: res.data } : { kind: "error" });
    });
  };

  useEffect(load, [asset.id]);

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    const res = await deleteRelationship(deleting.id);
    setDeleteBusy(false);
    if (!res.ok) {
      toast({ tone: "danger", description: t("relationships.errors.generic") });
      return;
    }
    toast({ tone: "success", description: t("relationships.deletedToast") });
    setDeleting(null);
    load();
  }

  if (state.kind === "loading") {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm text-muted-foreground">{t("relationships.loadError")}</p>
        <Button variant="secondary" size="sm" onClick={load}>
          {t("common.retry")}
        </Button>
      </div>
    );
  }

  const { data } = state;
  const sections = buildSections(t, data);
  const isEmpty = data.counts.total === 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t("relationships.summary", {
            outgoing: data.counts.outgoing,
            incoming: data.counts.incoming,
            total: data.counts.total,
          })}
        </p>
        <div className="flex items-center gap-2">
          <Link
            href={`/dependencies?asset_id=${encodeURIComponent(asset.id)}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <LinkIcon className="h-4 w-4" />
            {t("relationships.viewAll")}
          </Link>
          <Link
            href={`/topology?asset_id=${encodeURIComponent(asset.id)}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <NetworkIcon className="h-4 w-4" />
            {t("relationships.viewTopology")}
          </Link>
          {canManage ? (
            <Button size="sm" onClick={() => setAdding(true)}>
              <PlusIcon className="h-4 w-4" />
              {t("relationships.add.trigger")}
            </Button>
          ) : null}
        </div>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
          <p className="text-sm text-muted-foreground">{t("relationships.empty")}</p>
          {canManage ? (
            <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
              <PlusIcon className="h-4 w-4" />
              {t("relationships.add.trigger")}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {sections.map((section) => (
            <section key={section.key}>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.heading}
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                  {section.items.length}
                </span>
              </h3>
              <div className="flex flex-col gap-1.5">
                {section.items.map((rel) => {
                  const other = section.direction === "outgoing" ? rel.target : rel.source;
                  return (
                    <RelationshipItem
                      key={rel.id}
                      relationship={rel}
                      other={other}
                      canManage={canManage}
                      onEdit={() => setEditing(rel)}
                      onDelete={() => setDeleting(rel)}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <Link
        href={`/topology?asset_id=${encodeURIComponent(asset.id)}`}
        className="inline-flex items-center gap-1 self-start text-sm font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {t("relationships.viewTopology")}
        <ArrowRightIcon className="h-3.5 w-3.5" />
      </Link>

      {adding ? (
        <AddRelationshipDialog
          sourceAsset={asset}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            toast({ tone: "success", description: t("relationships.createdToast") });
            load();
          }}
        />
      ) : null}

      {editing ? (
        <EditRelationshipDialog
          relationship={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast({ tone: "success", description: t("relationships.updatedToast") });
            load();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        title={t("relationships.deleteConfirmTitle")}
        description={
          deleting
            ? t("relationships.deleteConfirmBody", {
                source: deleting.source.name,
                type: relationshipTypeLabel(t, deleting.relationship_type),
                target: deleting.target.name,
              })
            : ""
        }
        confirmLabel={t("relationships.deleteAction")}
        tone="danger"
        loading={deleteBusy}
      />
    </div>
  );
}
