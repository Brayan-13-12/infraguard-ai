import { BoxIcon, LayoutIcon, NetworkIcon } from "@/components/ui/icons";

/** Infrastructure symbols share the existing icon size, stroke and currentColor. */
export function AssetTypeIcon({ type }: { type: string }) {
  const className = "h-4 w-4";
  if (type === "Application") return <LayoutIcon className={className} />;
  if (type === "Network Device" || type === "Kubernetes Cluster") return <NetworkIcon className={className} />;
  if (type === "Container") return <BoxIcon className={className} />;
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {type === "Database" ? <>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0" />
      </> : type === "Cloud Resource" ? (
        <path d="M6 18a4 4 0 0 1-1-8 7 7 0 0 1 13-2 5 5 0 0 1 0 10Z" />
      ) : type === "Virtual Machine" ? <>
        <rect x="3" y="3" width="14" height="12" rx="2" />
        <path d="M7 19h12a2 2 0 0 0 2-2V7M7 7h6M7 11h3" />
      </> : <>
        <rect x="4" y="3" width="16" height="7" rx="2" />
        <rect x="4" y="14" width="16" height="7" rx="2" />
        <path d="M8 6.5h.01M8 17.5h.01M12 6.5h4M12 17.5h4" />
      </>}
    </svg>
  );
}
