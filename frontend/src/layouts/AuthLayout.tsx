import { Link, Outlet } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { CaptureRingIllustration } from '@/components/brand/Illustrations';

export function AuthLayout() {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col bg-surface px-6 py-8 sm:px-12">
        <Link to="/" aria-label="Vistora 3D home"><Logo /></Link>
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10"><Outlet /></main>
        <p className="text-xs text-ink-muted">By continuing you agree to the Terms and Privacy Policy.</p>
      </div>
      <aside className="relative hidden overflow-hidden bg-lavender lg:flex lg:flex-col lg:justify-center lg:px-16">
        <div className="absolute inset-0 grid-bg opacity-60" aria-hidden />
        <div className="relative">
          <CaptureRingIllustration className="mx-auto w-full max-w-md" />
          <h2 className="mt-10 text-2xl font-bold">From Every Angle to Every Detail.</h2>
          <p className="mt-2 max-w-md text-sm text-ink-muted">Upload overlapping photographs, reconstruct with AI or photogrammetry, inspect real mesh statistics and export to Blender, Maya, Unreal and Unity.</p>
        </div>
      </aside>
    </div>
  );
}
