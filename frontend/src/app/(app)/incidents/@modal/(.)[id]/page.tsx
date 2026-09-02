"use client";

import { useParams } from "next/navigation";

import { IncidentCreateWorkspace } from "@/components/incidents/IncidentCreateWorkspace";
import { IncidentDetailWorkspace } from "@/components/incidents/IncidentDetailWorkspace";

/**
 * Intercepting route for the `/incidents/<segment>` modal.
 *
 * In the Next.js App Router (15.x) a dynamic intercepting route `(.)[id]`
 * greedily matches a **sibling static** navigation target: a client-side
 * navigation to `/incidents/new` is resolved through this route (with
 * `id === "new"`) rather than through the adjacent `(.)new` interceptor - and no
 * folder arrangement (separate parallel slots, route groups, catch-all) changes
 * that. Since this interceptor is the one Next actually mounts for `new`, it
 * owns the routing decision: `new` → the create modal, anything else → the
 * detail workspace. `IncidentDetailWorkspace` / `IncidentDetailLoader` therefore
 * only ever receive a real incident id and never issue `GET /api/v1/incidents/new`.
 *
 * `@modal/(.)new/page.tsx` is kept as the semantically-correct create
 * interceptor: it is what Next mounts if a future release fixes the matcher.
 */
export default function InterceptedIncidentModal() {
  const { id } = useParams<{ id: string }>();

  if (id === "new") {
    return <IncidentCreateWorkspace />;
  }
  return <IncidentDetailWorkspace id={id} />;
}
