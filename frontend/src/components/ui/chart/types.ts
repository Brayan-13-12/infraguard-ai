/** One category in a chart / its companion table. */
export interface ChartDatum {
  /** Stable key (English catalog value). */
  key: string;
  /** Translated, human-readable label. */
  label: string;
  value: number;
  /** Any CSS color - typically `hsl(var(--chart-1))` or a semantic token. */
  color: string;
  /** Drill-down target. When set, the companion-table row is a link. */
  href?: string;
}
