import { lazy } from 'react';
import { Route } from 'react-router-dom';

const DashboardPage = lazy(() => import('./DashboardPage'));
const ProjectsPage = lazy(() => import('./ProjectsPage'));
const CreatePage = lazy(() => import('./CreatePage'));
const LibraryPage = lazy(() => import('./LibraryPage'));
const HistoryPage = lazy(() => import('./HistoryPage'));
const ProjectDetailPage = lazy(() => import('./ProjectDetailPage'));
const ProjectStudioPage = lazy(() => import('./ProjectStudioPage'));
const JobPage = lazy(() => import('./JobPage'));
const PrecisionStudioPage = lazy(() => import('./PrecisionStudioPage'));
const ModelWorkspacePage = lazy(() => import('./ModelWorkspacePage'));
const RefinementPage = lazy(() => import('./RefinementPage'));
const OptimizePage = lazy(() => import('./OptimizePage'));
const ExportCenterPage = lazy(() => import('./ExportCenterPage'));
const TeamPage = lazy(() => import('./TeamPage'));
const NotificationsPage = lazy(() => import('./NotificationsPage'));
const ProfilePage = lazy(() => import('./ProfilePage'));
const SettingsPage = lazy(() => import('./SettingsPage'));
const NotFoundPage = lazy(() => import('../NotFoundPage'));

export const appRoutes = (
  <>
    <Route index element={<DashboardPage />} />
    <Route path="create" element={<CreatePage />} />
    <Route path="projects" element={<ProjectsPage />} />
    <Route path="projects/:id" element={<ProjectDetailPage />} />
    <Route path="projects/:id/studio" element={<ProjectStudioPage />} />
    <Route path="library" element={<LibraryPage />} />
    <Route path="jobs/:id" element={<JobPage />} />
    <Route path="precision" element={<PrecisionStudioPage />} />
    <Route path="models/:id" element={<ModelWorkspacePage />} />
    <Route path="models/:id/refine" element={<RefinementPage />} />
    <Route path="models/:id/optimize" element={<OptimizePage />} />
    <Route path="exports" element={<ExportCenterPage />} />
    <Route path="team" element={<TeamPage />} />
    <Route path="notifications" element={<NotificationsPage />} />
    <Route path="profile" element={<ProfilePage />} />
    <Route path="settings" element={<SettingsPage />} />
    <Route path="*" element={<NotFoundPage />} />
    <Route path="history" element={<HistoryPage />} />
  </>
);
