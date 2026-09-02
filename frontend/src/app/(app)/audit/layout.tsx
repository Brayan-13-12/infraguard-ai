/**
 * Audit layout with a parallel `@modal` slot. `children` is the list
 * (`page.tsx`) or the full-page event detail on a hard load; `modal` is the
 * intercepted centered workspace during client navigation from the list, and
 * `@modal/default.tsx` (null) otherwise. Same architecture as Assets /
 * Incidents, minus the create / edit routes - the audit log is read-only.
 */
export default function AuditLayout({
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
