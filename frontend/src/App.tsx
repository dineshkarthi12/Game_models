import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PublicLayout } from '@/layouts/PublicLayout';
import { AuthLayout } from '@/layouts/AuthLayout';
import { AppLayout } from '@/layouts/AppLayout';
import { ProtectedRoute, GuestOnly } from '@/components/ProtectedRoute';
import { Spinner } from '@/components/ui/misc';
import { appRoutes } from '@/pages/app/routes';

const LandingPage = lazy(() => import('@/pages/public/LandingPage'));
const FeaturesPage = lazy(() => import('@/pages/public/FeaturesPage'));
const HowItWorksPage = lazy(() => import('@/pages/public/HowItWorksPage'));
const PricingPage = lazy(() => import('@/pages/public/PricingPage'));
const DocsPage = lazy(() => import('@/pages/public/DocsPage'));
const DesignSystemPage = lazy(() => import('@/pages/DesignSystemPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'));
const OAuthCallbackPage = lazy(() => import('@/pages/auth/OAuthCallbackPage'));

function PageFallback() {
  return <div className="grid min-h-[50vh] place-items-center"><Spinner /></div>;
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="features" element={<FeaturesPage />} />
          <Route path="how-it-works" element={<HowItWorksPage />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route path="docs" element={<DocsPage />} />
          <Route path="design-system" element={<DesignSystemPage />} />
        </Route>
        <Route element={<AuthLayout />}>
          <Route element={<GuestOnly />}>
            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route path="forgot-password" element={<ForgotPasswordPage />} />
          </Route>
          <Route path="reset-password" element={<ResetPasswordPage />} />
          <Route path="auth/callback" element={<OAuthCallbackPage />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="app" element={<AppLayout />}>{appRoutes}</Route>
        </Route>
        <Route path="documentation" element={<Navigate to="/docs" replace />} />
        <Route element={<PublicLayout />}><Route path="*" element={<NotFoundPage />} /></Route>
      </Routes>
    </Suspense>
  );
}
