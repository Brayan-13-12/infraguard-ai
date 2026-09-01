"use client";

import { Button } from "@/components/ui/Button";
import { useTranslation } from "@/i18n";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/** Compact "N–M of T" summary + Previous / Next controls. Hidden when empty. */
export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
}: PaginationProps) {
  const { t } = useTranslation();
  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const pages = Math.max(totalPages, 1);

  return (
    <nav
      className="flex flex-col items-center justify-between gap-3 sm:flex-row"
      aria-label={t("pagination.pageOf", { page, pages })}
    >
      <p className="text-xs text-muted-foreground">
        {t("pagination.summary", { from, to, total })}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          {t("pagination.previous")}
        </Button>
        <span className="text-xs text-muted-foreground">
          {t("pagination.pageOf", { page, pages })}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          {t("pagination.next")}
        </Button>
      </div>
    </nav>
  );
}
