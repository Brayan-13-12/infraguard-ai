/**
 * Chart colours as CSS-variable references. Passed straight to SVG `fill` /
 * `stroke`, so charts follow the active theme with no JS and no re-render.
 *
 * Criticality and status charts do NOT use the categorical palette - they reuse
 * the semantic severity tokens so the colours match the badges elsewhere.
 */

export const CHART_PALETTE = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-6))",
] as const;

export const CRITICALITY_COLORS: Record<string, string> = {
  Critical: "hsl(var(--danger))",
  High: "hsl(var(--warning))",
  Medium: "hsl(var(--caution))",
  Low: "hsl(var(--success))",
};

export const STATUS_COLORS: Record<string, string> = {
  Operational: "hsl(var(--success))",
  Degraded: "hsl(var(--warning))",
  Maintenance: "hsl(var(--info))",
  Offline: "hsl(var(--danger))",
};

/** Pick a categorical colour by index, cycling through the palette. */
export function paletteColor(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length]!;
}
