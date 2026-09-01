"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { AuthForm } from "@/components/AuthForm";
import { useAuth } from "@/components/AuthProvider";

export default function LoginPage() {
  const { status, login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [status, router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-6 px-6 py-16">
      <h2 className="text-2xl font-bold tracking-tight">InfraGuard AI</h2>
      <AuthForm
        mode="login"
        onSubmit={login}
        onSuccess={() => router.replace("/dashboard")}
      />
    </main>
  );
}
