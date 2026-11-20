import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { PublicLayout } from '@/layouts/PublicLayout';
import { Spinner } from '@/components/ui/misc';

const DesignSystemPage = lazy(() => import('@/pages/DesignSystemPage'));

function PageFallback() {
  return <div className="grid min-h-[50vh] place-items-center"><Spinner /></div>;
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/design-system" element={<DesignSystemPage />} />
          <Route path="*" element={<DesignSystemPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
