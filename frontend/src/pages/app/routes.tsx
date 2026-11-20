import { lazy } from 'react';
import { Route } from 'react-router-dom';

const DashboardPage = lazy(() => import('./DashboardPage'));
const ProjectsPage = lazy(() => import('./ProjectsPage'));
const CreatePage = lazy(() => import('./CreatePage'));
const LibraryPage = lazy(() => import('./LibraryPage'));
const HistoryPage = lazy(() => import('./HistoryPage'));
const ProjectDetailPage = lazy(() => import('./ProjectDetailPage'));
const ProjectStudioPage = lazy(() => import('./ProjectStudioPage'));

export const appRoutes = (
  <>
    <Route index element={<DashboardPage />} />
    <Route path="create" element={<CreatePage />} />
    <Route path="projects" element={<ProjectsPage />} />
    <Route path="projects/:id" element={<ProjectDetailPage />} />
    <Route path="projects/:id/studio" element={<ProjectStudioPage />} />
    <Route path="library" element={<LibraryPage />} />
    <Route path="history" element={<HistoryPage />} />
  </>
);
