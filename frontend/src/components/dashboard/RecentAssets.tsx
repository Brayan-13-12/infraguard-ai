"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AssetStatusBadge, CriticalityBadge } from "@/components/assets/AssetBadges";
import { assetTypeLabel } from "@/components/assets/catalog";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { ArrowRightIcon, ChevronRightIcon, ClockIcon } from "@/components/ui/icons";
import { LANGUAGE_LOCALES, useTranslation } from "@/i18n";
import { listAssets } from "@/services/assets";
import type { Asset } from "@/types/asset";

type State =
  | { kind: "loading" }
  | { kind: "loaded"; items: Asset[] }
  | { kind: "error" };

/**
 * The five most recently updated assets (existing list endpoint, `page_size=5`,
 * default `updated_at DESC` order). Rows link to the existing asset detail
 * route - no drawer in this phase. Refetches when `refreshToken` changes.
 */
export function RecentAssets({ refreshToken = 0 }: { refreshToken?: number }) {
  const { t, language } = useTranslation();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    if (refreshToken === 0) setState({ kind: "loading" });
    void listAssets({ page: 1, pageSize: 5 }).then((res) => {
      if (cancelled) return;
      setState(res.ok ? { kind: "loaded", items: res.data.items } : { kind: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(LANGUAGE_LOCALES[language], {
      day: "2-digit",
      month: "short",
    });

  return (
    <Card className="flex flex-col p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <ClockIcon className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            {t("dashboard.recent.title")}
          </h3>
        </div>
        <Link
          href="/assets"
          className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t("dashboard.recent.viewAll")}
          <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>
      </div>

      {state.kind === "loading" ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : state.kind === "error" ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("assets.loadErrorBody")}
        </p>
      ) : state.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("dashboard.recent.empty")}
        </p>
      ) : (
        <>
          {/* Desktop: table */}
          <table className="hidden w-full text-sm sm:table">
            <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr className="[&>th]:pb-2 [&>th]:font-medium">
                <th>{t("assetFields.name")}</th>
                <th>{t("assetFields.type")}</th>
                <th>{t("assetFields.criticality")}</th>
                <th>{t("assetFields.status")}</th>
                <th className="text-right">{t("assetFields.updated")}</th>
                <th aria-hidden="true" className="w-6" />
              </tr>
            </thead>
            <tbody>
              {state.items.map((a) => (
                <tr
                  key={a.id}
                  className="group border-t border-border/60 transition-colors hover:bg-muted/40 [&>td]:py-2.5"
                >
                  <td className="pr-3">
                    <Link
                      href={`/assets/${a.id}`}
                      className="font-mono text-[13px] font-medium text-foreground group-hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {a.name}
                    </Link>
                  </td>
                  <td className="pr-3 text-muted-foreground">{assetTypeLabel(t, a.asset_type)}</td>
                  <td className="pr-3">
                    <CriticalityBadge value={a.criticality} />
                  </td>
                  <td className="pr-3">
                    <AssetStatusBadge value={a.status} />
                  </td>
                  <td className="text-right tabular-nums text-muted-foreground">
                    {fmtDate(a.updated_at)}
                  </td>
                  <td className="pl-2 text-right">
                    <ChevronRightIcon className="ml-auto h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile: cards */}
          <ul className="flex flex-col gap-2 sm:hidden">
            {state.items.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/assets/${a.id}`}
                  className="flex items-center gap-2 rounded-lg border border-border p-3 transition-colors hover:border-primary/30 hover:bg-muted/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.99] motion-reduce:active:scale-100"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-[13px] font-medium text-foreground">
                        {a.name}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {fmtDate(a.updated_at)}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">
                        {assetTypeLabel(t, a.asset_type)}
                      </span>
                      <CriticalityBadge value={a.criticality} />
                      <AssetStatusBadge value={a.status} />
                    </span>
                  </span>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
