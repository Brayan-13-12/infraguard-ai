"use client";

import { useParams } from "next/navigation";

import { AssetDetailDrawer } from "@/components/assets/AssetDetailDrawer";

/** Intercepts `/assets/[id]` during client navigation from the inventory. */
export default function InterceptedAssetDetail() {
  const { id } = useParams<{ id: string }>();
  return <AssetDetailDrawer id={id} />;
}
