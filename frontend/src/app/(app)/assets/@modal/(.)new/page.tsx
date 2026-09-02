"use client";

import { AssetCreateDrawer } from "@/components/assets/AssetCreateDrawer";

/** Intercepts `/assets/new` during client navigation from the inventory. */
export default function InterceptedAssetCreate() {
  return <AssetCreateDrawer />;
}
