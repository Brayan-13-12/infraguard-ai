"use client";

import { useCallback, useEffect, useState } from "react";

import type { AdminError } from "@/services/admin";
import { getRole, getUser } from "@/services/admin";
import type { AdminUserDetail, RoleDetail } from "@/types/rbac";

export type AdminLoadState<T> =
  | { kind: "loading" }
  | { kind: "notfound" }
  | { kind: "forbidden" }
  | { kind: "error" }
  | { kind: "ready"; item: T };

function toState<T>(res: { ok: true; data: T } | { ok: false; error: AdminError }): AdminLoadState<T> {
  if (res.ok) return { kind: "ready", item: res.data };
  if (res.error.kind === "not_found") return { kind: "notfound" };
  if (res.error.kind === "forbidden" || res.error.kind === "unauthorized") {
    return { kind: "forbidden" };
  }
  return { kind: "error" };
}

function useLoader<T>(id: string, fetcher: (id: string) => Promise<{ ok: true; data: T } | { ok: false; error: AdminError }>) {
  const [state, setState] = useState<AdminLoadState<T>>({ kind: "loading" });

  const load = useCallback(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    void fetcher(id).then((res) => {
      if (!cancelled) setState(toState(res));
    });
    return () => {
      cancelled = true;
    };
  }, [id, fetcher]);

  useEffect(load, [load]);

  const setItem = useCallback((item: T) => setState({ kind: "ready", item }), []);
  return { state, reload: load, setItem };
}

export function AdminUserLoader({
  id,
  render,
}: {
  id: string;
  render: (ctx: {
    state: AdminLoadState<AdminUserDetail>;
    reload: () => void;
    setItem: (item: AdminUserDetail) => void;
  }) => React.ReactNode;
}) {
  const ctx = useLoader<AdminUserDetail>(id, getUser);
  return <>{render(ctx)}</>;
}

export function AdminRoleLoader({
  id,
  render,
}: {
  id: string;
  render: (ctx: {
    state: AdminLoadState<RoleDetail>;
    reload: () => void;
    setItem: (item: RoleDetail) => void;
  }) => React.ReactNode;
}) {
  const ctx = useLoader<RoleDetail>(id, getRole);
  return <>{render(ctx)}</>;
}
