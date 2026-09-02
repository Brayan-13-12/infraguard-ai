/**
 * Assets layout with a parallel `@modal` slot. `children` is the inventory
 * (`page.tsx`) or a full-page detail/create/edit route on a hard load; `modal`
 * is the intercepted drawer during client navigation from the list, and
 * `@modal/default.tsx` (null) otherwise.
 */
export default function AssetsLayout({
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
