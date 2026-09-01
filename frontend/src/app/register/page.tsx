"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthForm } from "@/components/AuthForm";
import { useAuth } from "@/components/AuthProvider";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/i18n";

export default function RegisterPage() {
  const { status, register } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [status, router]);

  return (
    <AuthLayout>
      {registeredEmail ? (
        <div className="motion-safe:animate-fade-in-up">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {t("auth.registeredTitle")}
          </h1>
          <Alert tone="success" className="mt-4">
            {t("auth.registeredBody", { email: registeredEmail })}
          </Alert>
          <Button fullWidth className="mt-5" onClick={() => router.replace("/login")}>
            {t("auth.registeredContinue")}
          </Button>
        </div>
      ) : (
        <AuthForm
          mode="register"
          onSubmit={register}
          onSuccess={(user) => setRegisteredEmail(user.email)}
        />
      )}
    </AuthLayout>
  );
}
