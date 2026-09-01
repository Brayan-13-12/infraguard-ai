/**
 * Minimal class-name joiner. Keeps only non-empty string arguments and joins
 * them with a space, so `cond && "class"` / `cond ? "a" : null` all work.
 *
 * Dependency-free (no `clsx` / `tailwind-merge`): the internal component set is
 * small and every call site is ours, so class conflicts are avoided by
 * construction rather than resolved at runtime.
 */
export function cn(...values: unknown[]): string {
  return values.filter((v): v is string => typeof v === "string" && v.length > 0).join(" ");
}
