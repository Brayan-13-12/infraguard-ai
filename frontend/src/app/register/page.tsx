"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthForm } from "@/components/AuthForm";
import { useAuth } from "@/components/AuthProvider";

export default function RegisterPage() {
  const { status, register } = useAuth();
  const router = useRouter();
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [status, router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-6 px-6 py-16">
      <h2 className="text-2xl font-bold tracking-tight">InfraGuard AI</h2>
      {registeredEmail ? (
        <div className="w-full max-w-sm rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
          <p className="font-medium text-emerald-800 dark:text-emerald-300">
            Account created for {registeredEmail}.
          </p>
          <button
            type="button"
            onClick={() => router.replace("/login")}
            className="mt-4 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
          >
            Continue to sign in
          </button>
        </div>
      ) : (
        <AuthForm
          mode="register"
          onSubmit={register}
          onSuccess={(user) => setRegisteredEmail(user.email)}
        />
      )}
    </main>
  );
}
