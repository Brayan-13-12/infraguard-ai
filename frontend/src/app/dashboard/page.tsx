"use client";

import { useAuth } from "@/components/AuthProvider";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/shell/AppShell";
import { SystemHealthPanel } from "@/components/SystemHealth";
import { AccountCard } from "@/components/dashboard/AccountCard";
import { PlatformModules } from "@/components/dashboard/PlatformModules";
import { PageHeader } from "@/components/ui/PageHeader";
import { Reveal } from "@/components/ui/Reveal";
import { useTranslation } from "@/i18n";

function DashboardContent() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const name = user?.email?.split("@")[0];

  return (
    <div className="flex flex-col gap-8">
      <Reveal>
        <PageHeader
          // Product page name - always English, like the sidebar nav label.
          title="Dashboard"
          description={
            name ? t("dashboard.welcome", { name }) : t("dashboard.welcomeNoName")
          }
        />
      </Reveal>

      <Reveal delayMs={60}>
        <PlatformModules />
      </Reveal>

      <Reveal delayMs={120} className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <SystemHealthPanel />
        <AccountCard user={user} />
      </Reveal>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <AppShell>
        <DashboardContent />
      </AppShell>
    </RequireAuth>
  );
}
