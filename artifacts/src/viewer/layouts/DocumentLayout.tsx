import { lazy, Suspense } from 'react';

const DocumentPage = lazy(() => import('../document/shims').then(() => import('../document/DocumentPage')));

export function DocumentLayout({ id }: { id: string }) {
  return (
    <Suspense fallback={null}>
      <DocumentPage id={id} />
    </Suspense>
  );
}
