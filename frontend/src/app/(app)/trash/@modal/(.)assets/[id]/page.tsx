"use client";

import { useParams } from "next/navigation";

import { TrashAssetWorkspace } from "@/components/trash/TrashDetailWorkspace";

/** Intercepting route for `/trash/assets/<id>` - a read-only workspace over the
 *  still-mounted Trash list. `assets` / `incidents` are static siblings under
 *  `/trash`, so this interceptor only ever receives a real asset id. */
export default function InterceptedTrashAsset() {
  const { id } = useParams<{ id: string }>();
  return <TrashAssetWorkspace id={id} />;
}
