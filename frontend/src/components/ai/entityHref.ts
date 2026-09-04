import type { AIEntityRef } from "@/types/ai";

/** The existing detail workspace route for an AI-referenced entity, or null. */
export function entityHref(entity: AIEntityRef): string | null {
  switch (entity.type) {
    case "asset":
      return `/assets/${entity.id}`;
    case "incident":
      return `/incidents/${entity.id}`;
    case "audit_event":
      return `/audit/${entity.id}`;
    default:
      return null;
  }
}
