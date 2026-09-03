"use client";

import { Button } from "@/components/ui/Button";
import { WorkspaceDialog } from "@/components/ui/overlay";
import { useCloseDrawer } from "@/hooks/useCloseDrawer";
import { useTranslation } from "@/i18n";

import { RestoreAction } from "./RestoreAction";
import { TrashAssetLoader, TrashIncidentLoader, type TrashLoadState } from "./TrashDetailLoader";
import { TrashAssetDetailContent } from "./TrashAssetDetail";
import { TrashIncidentDetailContent } from "./TrashIncidentDetail";
import { TrashDetailSkeleton } from "./TrashListSkeleton";

function NotFoundOrError<T>({
  state,
  reload,
  close,
}: {
  state: Extract<TrashLoadState<T>, { kind: "notfound" | "error" }>;
  reload: () => void;
  close: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <p className="text-sm font-medium text-foreground">
        {state.kind === "notfound"
          ? t("trashDetail.notFoundTitle")
          : t("trashDetail.loadError")}
      </p>
      {state.kind === "notfound" ? (
        <p className="max-w-xs text-sm text-muted-foreground">{t("trashDetail.notFoundBody")}</p>
      ) : null}
      <div className="mt-1 flex gap-2">
        {state.kind === "error" ? (
          <Button variant="secondary" size="sm" onClick={reload}>
            {t("common.retry")}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={close}>
          {t("overlay.close")}
        </Button>
      </div>
    </div>
  );
}

/** Route-aware read-only workspace for a trashed asset, opened over the still-
 *  mounted Trash list. Primary (only) action: Restore. */
export function TrashAssetWorkspace({ id }: { id: string }) {
  const { t } = useTranslation();
  const close = useCloseDrawer("/trash");

  return (
    <TrashAssetLoader
      id={id}
      render={({ state, reload }) => {
        const item = state.kind === "ready" ? state.item : null;
        const label = item ? item.name : t("trashDetail.assetTitle");
        const header = (
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">{label}</h2>
            <p className="text-xs text-muted-foreground">{t("trashDetail.assetTitle")}</p>
          </div>
        );
        const footer =
          item != null ? (
            <div className="flex items-center justify-end">
              <RestoreAction kind="assets" id={item.id} label={item.name} onRestored={close} />
            </div>
          ) : undefined;

        return (
          <WorkspaceDialog label={label} header={header} footer={footer} onClose={close}>
            {state.kind === "loading" ? (
              <TrashDetailSkeleton />
            ) : state.kind === "notfound" || state.kind === "error" ? (
              <NotFoundOrError state={state} reload={reload} close={close} />
            ) : (
              <TrashAssetDetailContent asset={state.item} />
            )}
          </WorkspaceDialog>
        );
      }}
    />
  );
}

/** Route-aware read-only workspace for a trashed incident. */
export function TrashIncidentWorkspace({ id }: { id: string }) {
  const { t } = useTranslation();
  const close = useCloseDrawer("/trash");

  return (
    <TrashIncidentLoader
      id={id}
      render={({ state, reload }) => {
        const item = state.kind === "ready" ? state.item : null;
        const label = item ? item.title : t("trashDetail.incidentTitle");
        const header = (
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">{label}</h2>
            <p className="text-xs text-muted-foreground">{t("trashDetail.incidentTitle")}</p>
          </div>
        );
        const footer =
          item != null ? (
            <div className="flex items-center justify-end">
              <RestoreAction
                kind="incidents"
                id={item.id}
                label={item.title}
                onRestored={close}
              />
            </div>
          ) : undefined;

        return (
          <WorkspaceDialog label={label} header={header} footer={footer} onClose={close}>
            {state.kind === "loading" ? (
              <TrashDetailSkeleton />
            ) : state.kind === "notfound" || state.kind === "error" ? (
              <NotFoundOrError state={state} reload={reload} close={close} />
            ) : (
              <TrashIncidentDetailContent incident={state.item} />
            )}
          </WorkspaceDialog>
        );
      }}
    />
  );
}
