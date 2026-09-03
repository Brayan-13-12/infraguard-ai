/**
 * Administration layout with a parallel `@modal` slot. `children` is the tabbed
 * Users / Roles browser (`page.tsx`) or a full-page detail on a hard load;
 * `modal` is the intercepted centered workspace during client navigation from a
 * list. Same architecture as Assets / Incidents / Trash. `users` / `roles` are
 * static siblings, so the interceptors only ever receive a real id.
 */
export default function AdminLayout({
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
