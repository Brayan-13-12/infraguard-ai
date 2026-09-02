"use client";

import Link from "next/link";

import { AuthNav } from "@/components/AuthNav";
import { Brand } from "@/components/Brand";
import { SystemHealthPanel } from "@/components/SystemHealth";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { ArrowRightIcon } from "@/components/ui/icons";
import { useTranslation } from "@/i18n";

export default function Home() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Brand />
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle className="hidden sm:inline-flex" />
            <AuthNav />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6">
        <section className="flex flex-col items-center py-16 text-center motion-safe:animate-fade-in-up sm:py-24">
          <Badge tone="info">{t("landing.badge")}</Badge>
          <h1 className="mt-5 max-w-2xl text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {t("common.appTagline")}
          </h1>
          <p className="mt-4 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t("landing.body")}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/register" className={buttonClasses()}>
              {t("landing.createAccount")} <ArrowRightIcon />
            </Link>
            <Link href="/login" className={buttonClasses({ variant: "secondary" })}>
              {t("landing.signIn")}
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-xl pb-20">
          <SystemHealthPanel />
          <p className="mt-4 text-center text-xs text-muted-foreground">
            {t("landing.healthNote")}
          </p>
        </section>
      </main>
    </div>
  );
}
