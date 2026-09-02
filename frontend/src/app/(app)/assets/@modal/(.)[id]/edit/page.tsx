"use client";

import { useParams } from "next/navigation";

import { AssetEditDrawer } from "@/components/assets/AssetEditDrawer";

/** Intercepts `/assets/[id]/edit` - replaces the detail drawer in the modal slot. */
export default function InterceptedAssetEdit() {
  const { id } = useParams<{ id: string }>();
  return <AssetEditDrawer id={id} />;
}
