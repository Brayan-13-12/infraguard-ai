import { Skeleton } from "@/components/ui/Skeleton";

/** Loading placeholder that mirrors the timeline (node + title + meta + summary). */
export function AuditTimelineSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-7">
      {[0, 1].map((group) => (
        <div key={group}>
          <Skeleton className="mb-3 h-3 w-24" />
          <div className="flex flex-col gap-4">
            {Array.from({ length: group === 0 ? Math.ceil(rows / 2) : Math.floor(rows / 2) }).map(
              (_, i) => (
                <div key={i} className="relative pl-12">
                  <Skeleton className="absolute left-0 top-0 h-9 w-9 rounded-full" />
                  <Skeleton className="mb-1 h-3 w-10" />
                  <div className="rounded-lg border border-border p-3">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="mt-2 h-3 w-56" />
                    <Skeleton className="mt-2 h-3 w-32" />
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
