import { describe, expect, it } from "vitest";

import {
  ArrowsSwapIcon,
  CheckIcon,
  LinkIcon,
  RefreshIcon,
  RestoreIcon,
  TrashIcon,
} from "@/components/ui/icons";

import { auditActionVisual, NEUTRAL_ACTION_VISUAL } from "./catalog";

/** The semantic colour family a visual belongs to, extracted from its classes. */
function family(action: string): string {
  return auditActionVisual(action).node.match(/bg-audit-([a-z]+)\//)?.[1] ?? "neutral";
}

describe("auditActionVisual — semantic colour system", () => {
  it("gives every emitted action a distinct colour family", () => {
    expect(family("CREATE")).toBe("create");
    expect(family("UPDATE")).toBe("update");
    expect(family("STATUS_CHANGED")).toBe("status");
    expect(family("RESOLVED")).toBe("resolved");
    expect(family("REOPENED")).toBe("reopened");
    expect(family("RELATION_CHANGED")).toBe("relation");
    expect(family("LOGIN")).toBe("login");
    expect(family("LOGOUT")).toBe("logout");
  });

  it("CREATE and UPDATE are different families (the core review complaint)", () => {
    expect(family("CREATE")).not.toBe(family("UPDATE"));
    expect(auditActionVisual("CREATE").node).not.toBe(auditActionVisual("UPDATE").node);
  });

  it("LOGIN is visually distinct from UPDATE", () => {
    expect(family("LOGIN")).not.toBe(family("UPDATE"));
  });

  it("RESOLVED and REOPENED are distinguishable", () => {
    expect(family("RESOLVED")).not.toBe(family("REOPENED"));
  });

  it("STATUS_CHANGED is the amber/status family", () => {
    expect(auditActionVisual("STATUS_CHANGED").node).toContain("text-audit-status");
    expect(auditActionVisual("STATUS_CHANGED").rail).toContain("bg-audit-status");
    expect(auditActionVisual("STATUS_CHANGED").accent).toContain("before:bg-audit-status");
  });

  it("RELATION_CHANGED is the indigo/relation family", () => {
    expect(family("RELATION_CHANGED")).toBe("relation");
  });

  it("node, rail and accent of an action all reference the same colour family", () => {
    for (const a of ["CREATE", "UPDATE", "STATUS_CHANGED", "RESOLVED", "LOGIN", "DELETE"]) {
      const v = auditActionVisual(a);
      const fam = family(a);
      expect(v.rail).toContain(`bg-audit-${fam}`);
      expect(v.accent).toContain(`before:bg-audit-${fam}`);
    }
  });

  it("exposes a stronger accent than rail (hierarchy: node > accent > rail)", () => {
    // accent carries a high-opacity `/80`+ value; the rail stays in the /40-/50 band.
    const v = auditActionVisual("CREATE");
    expect(v.accent).toMatch(/before:bg-audit-create\/(8|9)\d/);
    expect(v.rail).toMatch(/bg-audit-create\/(3|4|5)\d/);
  });

  it("prepares DELETE / RESTORE visuals for the future Trash module", () => {
    const del = auditActionVisual("DELETE");
    expect(del.icon).toBe(TrashIcon);
    expect(del.node).toContain("text-audit-delete");

    const res = auditActionVisual("RESTORE");
    expect(res.icon).toBe(RestoreIcon);
    expect(res.node).toContain("text-audit-restore");
    expect(family("RESTORE")).toBe("restore");
  });

  it("keeps the existing icons for the emitted actions", () => {
    expect(auditActionVisual("STATUS_CHANGED").icon).toBe(ArrowsSwapIcon);
    expect(auditActionVisual("RESOLVED").icon).toBe(CheckIcon);
    expect(auditActionVisual("REOPENED").icon).toBe(RefreshIcon);
    expect(auditActionVisual("RELATION_CHANGED").icon).toBe(LinkIcon);
  });

  it("falls back to a neutral visual for an unknown action", () => {
    expect(auditActionVisual("SOMETHING_NEW")).toBe(NEUTRAL_ACTION_VISUAL);
    expect(NEUTRAL_ACTION_VISUAL.node).toContain("bg-muted");
  });
});
