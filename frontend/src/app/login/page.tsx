"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { AuthForm } from "@/components/AuthForm";
import { useAuth } from "@/components/AuthProvider";
import { AuthLayout } from "@/components/auth/AuthLayout";

export default function LoginPage() {
  const { status, login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [status, router]);

  return (
    <AuthLayout>
      <AuthForm
        mode="login"
        onSubmit={login}
        onSuccess={() => router.replace("/dashboard")}
      />
    </AuthLayout>
  );
}
