"use client";

import { useParams } from "next/navigation";

import { AssetCreateWorkspace } from "@/components/assets/AssetCreateWorkspace";
import { AssetDetailWorkspace } from "@/components/assets/AssetDetailWorkspace";

/**
 * Intercepting route for the `/assets/<segment>` modal.
 *
 * In the Next.js App Router (15.x) a dynamic intercepting route `(.)[id]`
 * greedily matches a **sibling static** navigation target: a client-side
 * navigation to `/assets/new` is resolved through this route (with
 * `id === "new"`) rather than through the adjacent `(.)new` interceptor - and no
 * folder arrangement (separate parallel slots, route groups, catch-all) changes
 * that (see the equivalent note on the Incidents interceptor). Since this
 * interceptor is the one Next actually mounts for `new`, it owns the routing
 * decision: `new` → the create modal, anything else → the detail workspace.
 * `AssetDetailWorkspace` / `AssetDetailLoader` therefore only ever receive a
 * real asset id and never issue `GET /api/v1/assets/new`.
 */
export default function InterceptedAssetModal() {
  const { id } = useParams<{ id: string }>();

  if (id === "new") {
    return <AssetCreateWorkspace />;
  }
  return <AssetDetailWorkspace id={id} />;
}
