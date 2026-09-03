import type { useTranslation } from "@/i18n";

type T = ReturnType<typeof useTranslation>["t"];

/** "Eliminado por ops@example.com · 2 sept 2026, 14:03" - the who + when line. */
export function deletedByLine(
  t: T,
  locale: string,
  deletedAt: string,
  deletedByEmail: string | null,
): string {
  const time = new Date(deletedAt).toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return t("trash.deletedByLine", {
    actor: deletedByEmail ?? t("trash.deletedBySystem"),
    time,
  });
}

export function formatDateTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
