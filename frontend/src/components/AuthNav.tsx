"use client";

import Link from "next/link";

import { useAuth } from "@/components/AuthProvider";

export function AuthNav() {
  const { status, user } = useAuth();

  return (
    <nav className="flex items-center gap-3 text-sm">
      {status === "authenticated" ? (
        <>
          <span className="text-slate-500 dark:text-slate-400">{user?.email}</span>
          <Link
            href="/dashboard"
            className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white dark:bg-slate-100 dark:text-slate-900"
          >
            Dashboard
          </Link>
        </>
      ) : (
        <>
          <Link href="/login" className="font-medium underline">
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white dark:bg-slate-100 dark:text-slate-900"
          >
            Create account
          </Link>
        </>
      )}
    </nav>
  );
}
