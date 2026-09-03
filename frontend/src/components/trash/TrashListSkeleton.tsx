import { Skeleton } from "@/components/ui/Skeleton";

/** Loading placeholder for a Trash list (table on desktop, cards on mobile). */
export function TrashListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4"
        >
          <Skeleton className="h-4 w-40" />
          <Skeleton className="hidden h-4 w-24 sm:block" />
          <Skeleton className="hidden h-4 w-20 md:block" />
          <Skeleton className="ml-auto h-4 w-28" />
          <Skeleton className="h-7 w-20 rounded-md" />
        </div>
      ))}
    </div>
  );
}

/** Loading placeholder for the Trash detail workspace. */
export function TrashDetailSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-5">
      <Skeleton className="h-9 w-56" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,180px)_1fr]">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}
