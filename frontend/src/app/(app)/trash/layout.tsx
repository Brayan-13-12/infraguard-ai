/**
 * Trash layout with a parallel `@modal` slot. `children` is the tabbed list
 * (`page.tsx`) or a full-page trashed-item detail on a hard load; `modal` is the
 * intercepted centered workspace during client navigation from a list, and
 * `@modal/default.tsx` (null) otherwise. Same architecture as Assets / Incidents
 * / Audit; there are no create / edit routes - a trashed item is read-only until
 * it is restored.
 */
export default function TrashLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
