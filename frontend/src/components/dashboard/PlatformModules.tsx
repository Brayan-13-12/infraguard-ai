"use client";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import {
  AlertTriangleIcon,
  BoxIcon,
  ShieldIcon,
  SparklesIcon,
} from "@/components/ui/icons";
import { useTranslation, type TranslationKey } from "@/i18n";

type ModuleStatus = "active" | "soon";

interface ModuleDef {
  /** Module name - always English (product proper noun). */
  name: string;
  descriptionKey: TranslationKey;
  status: ModuleStatus;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

const MODULES: ModuleDef[] = [
  {
    name: "Authentication",
    descriptionKey: "dashboard.modules.authenticationDescription",
    status: "active",
    Icon: ShieldIcon,
  },
  {
    name: "Assets",
    descriptionKey: "dashboard.modules.assetsDescription",
    status: "soon",
    Icon: BoxIcon,
  },
  {
    name: "Incidents",
    descriptionKey: "dashboard.modules.incidentsDescription",
    status: "soon",
    Icon: AlertTriangleIcon,
  },
  {
    name: "AI Intelligence",
    descriptionKey: "dashboard.modules.aiDescription",
    status: "soon",
    Icon: SparklesIcon,
  },
];

export function PlatformModules() {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="modules-heading">
      <h2 id="modules-heading" className="text-base font-semibold text-foreground">
        {t("dashboard.modulesTitle")}
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {MODULES.map(({ name, descriptionKey, status, Icon }) => {
          const active = status === "active";
          return (
            <Card
              key={name}
              className={
                "flex items-start gap-3.5 p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none " +
                (active ? "" : "opacity-95")
              }
            >
              <span
                className={
                  "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg " +
                  (active
                    ? "bg-primary/12 text-primary"
                    : "bg-muted text-muted-foreground")
                }
                aria-hidden="true"
              >
                <Icon />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{name}</p>
                  {active ? (
                    <Badge tone="success" dot>
                      {t("common.active")}
                    </Badge>
                  ) : (
                    <Badge tone="neutral">Coming soon</Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{t(descriptionKey)}</p>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
