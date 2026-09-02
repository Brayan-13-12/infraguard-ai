"use client";

import { useParams } from "next/navigation";

import { AuditDetailWorkspace } from "@/components/audit/AuditDetailWorkspace";

/**
 * Intercepting route for the `/audit/<id>` centered workspace. `/audit` has no
 * sibling static routes (the log is read-only - no `new` / `edit`), so this
 * interceptor only ever receives a real event id.
 */
export default function InterceptedAuditModal() {
  const { id } = useParams<{ id: string }>();
  return <AuditDetailWorkspace id={id} />;
}
