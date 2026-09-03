/**
 * Tiny event bus so an admin mutation in a workspace tells the still-mounted
 * Users / Roles lists to refetch - same pattern as `assetsRefresh` /
 * `trashRefresh`.
 */

const EVENT = "infraguard:admin-changed";

export interface AdminChangedDetail {
  scope?: "users" | "roles" | "all";
}

export function subscribeAdminChanged(
  listener: (detail: AdminChangedDetail) => void,
): () => void {
  const handler = (e: Event) => listener((e as CustomEvent<AdminChangedDetail>).detail ?? {});
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

export function notifyAdminChanged(detail: AdminChangedDetail = { scope: "all" }): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AdminChangedDetail>(EVENT, { detail }));
}
