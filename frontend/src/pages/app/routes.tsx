import { lazy } from 'react';
import { Route } from 'react-router-dom';

const DashboardPage = lazy(() => import('./DashboardPage'));

export const appRoutes = (
  <>
    <Route index element={<DashboardPage />} />
  </>
);
