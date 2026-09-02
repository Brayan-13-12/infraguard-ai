"use client";

import { IncidentCreateWorkspace } from "@/components/incidents/IncidentCreateWorkspace";

/**
 * Semantically-correct interceptor for `/incidents/new`.
 *
 * Next.js 15.x currently routes a client-side `/incidents/new` navigation
 * through the sibling dynamic `(.)[id]` interceptor instead of this one (see the
 * note in `(.)[id]/page.tsx`), so in practice the create modal is mounted from
 * there. This file is retained so the intent stays visible in the route tree and
 * so the create flow keeps working unchanged if a future Next release fixes the
 * static-vs-dynamic interception precedence.
 */
export default function InterceptedIncidentCreate() {
  return <IncidentCreateWorkspace />;
}
