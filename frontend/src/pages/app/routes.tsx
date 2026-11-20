import { lazy } from 'react';
import { Route } from 'react-router-dom';

const DashboardPage = lazy(() => import('./DashboardPage'));
const ProjectsPage = lazy(() => import('./ProjectsPage'));
const CreatePage = lazy(() => import('./CreatePage'));
const LibraryPage = lazy(() => import('./LibraryPage'));
const HistoryPage = lazy(() => import('./HistoryPage'));

export const appRoutes = (
  <>
    <Route index element={<DashboardPage />} />
    <Route path="create" element={<CreatePage />} />
    <Route path="projects" element={<ProjectsPage />} />
    <Route path="library" element={<LibraryPage />} />
    <Route path="history" element={<HistoryPage />} />
  </>
);
