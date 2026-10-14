"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { RequirePermission } from "@/components/auth/RequirePermission";
import { RelationshipEditor } from "@/components/dependencies/RelationshipEditor";
import { TopologyWorkspace } from "@/components/topology/TopologyWorkspace";
import { Tabs, tabPanelProps, useTabsId } from "@/components/ui/Tabs";
import { useTranslation } from "@/i18n";
import { AssetsBrowser } from "./AssetsBrowser";

export function AssetsWorkspace() {
  const { can } = useAuth();
  const { t } = useTranslation();
  const params = useSearchParams();
  const router = useRouter();
  const section = params.get("section") === "map" || !can("assets.read") ? "map" : "inventory";
  const view = params.get("view") === "relations" || (!params.get("view") && !can("assets.read")) ? "relations" : "graph";
  const mainId = useTabsId("assets");
  const mapId = useTabsId("infrastructure");
  function navigate(nextSection: string, nextView = view) {
    const query = new URLSearchParams();
    if (nextSection === "map") {
      query.set("section", "map");
      query.set("view", nextView);
      const assetId = params.get("asset_id");
      if (assetId) query.set("asset_id", assetId);
    }
    router.push(query.size ? `/assets?${query}` : "/assets", { scroll: false });
  }
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Tabs idBase={mainId} value={section} onChange={(id) => navigate(id)} tabs={[
        ...(can("assets.read") ? [{ id: "inventory", label: t("assetsWorkspace.inventory") }] : []),
        ...(can("relationships.read") ? [{ id: "map", label: t("assetsWorkspace.map") }] : []),
      ]} />
      <div {...tabPanelProps(mainId, section)}>
        {section === "inventory" ? (
          <RequirePermission permission="assets.read"><AssetsBrowser title={t("assetsWorkspace.inventory")} /></RequirePermission>
        ) : (
          <RequirePermission permission="relationships.read">
            <div className="flex min-w-0 flex-col gap-4">
              <Tabs idBase={mapId} value={view} onChange={(id) => navigate("map", id)} tabs={[
                { id: "graph", label: t("assetsWorkspace.graph") },
                { id: "relations", label: t("assetsWorkspace.relations") },
              ]} />
              <div {...tabPanelProps(mapId, view)}>
                {view === "graph" ? (
                  <RequirePermission permission="assets.read"><TopologyWorkspace title={t("assetsWorkspace.graph")} key={params.get("asset_id") ?? "global"} /></RequirePermission>
                ) : <RelationshipEditor initialAssetId={params.get("asset_id")} key={params.get("asset_id") ?? "empty"} />}
              </div>
            </div>
          </RequirePermission>
        )}
      </div>
    </div>
  );
}
