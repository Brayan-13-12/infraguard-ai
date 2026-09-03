"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AuthForm } from "@/components/AuthForm";
import { useAuth } from "@/components/AuthProvider";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/i18n";
import type { AuthResult, RegisterOutcome } from "@/types/auth";

export default function RegisterPage() {
  const { status, register } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const [submitted, setSubmitted] = useState(false);
  // The 201 body has no email; keep the one that was submitted for the summary.
  const emailRef = useRef<string>("");

  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [status, router]);

  async function handleSubmit(
    email: string,
    password: string,
  ): Promise<AuthResult<RegisterOutcome>> {
    const result = await register(email, password);
    if (result.ok) emailRef.current = email;
    return result;
  }

  return (
    <AuthLayout>
      {submitted ? (
        <div className="motion-safe:animate-fade-in-up">
          <h1 className="pr-10 text-xl font-semibold tracking-tight text-foreground">
            {t("auth.requestSubmittedTitle")}
          </h1>
          <Alert tone="success" className="mt-4">
            {t("auth.requestSubmittedBody", { email: emailRef.current })}
          </Alert>
          <p className="mt-3 text-sm text-muted-foreground">
            {t("auth.requestSubmittedHint")}
          </p>
          <Button fullWidth className="mt-5" onClick={() => router.replace("/login")}>
            {t("auth.requestSubmittedContinue")}
          </Button>
        </div>
      ) : (
        <AuthForm
          mode="register"
          onSubmit={handleSubmit}
          onSuccess={() => setSubmitted(true)}
        />
      )}
    </AuthLayout>
  );
}
