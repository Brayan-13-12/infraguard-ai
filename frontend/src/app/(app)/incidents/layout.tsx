/**
 * Incidents layout with a parallel `@modal` slot. `children` is the list
 * (`page.tsx`) or a full-page detail/create/edit route on a hard load; `modal`
 * is the intercepted overlay during client navigation from the list (the detail
 * workspace, the create modal, or the edit drawer), and `@modal/default.tsx`
 * (null) otherwise. Same architecture as Assets.
 *
 * See `@modal/(.)[id]/page.tsx` for why `/incidents/new` is dispatched from the
 * dynamic interceptor rather than from `(.)new`.
 */
export default function IncidentsLayout({
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
