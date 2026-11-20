import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Button, buttonVariants } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/utils/cn';

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/features', label: 'Features' },
  { to: '/how-it-works', label: 'How It Works' },
  { to: '/app/create', label: 'Create 3D' },
  { to: '/app/library', label: 'Asset Library' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/docs', label: 'Documentation' },
];

export function PublicLayout() {
  const [open, setOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      <header className="sticky top-0 z-40 border-b border-line/70 bg-surface/90 backdrop-blur">
        <div className="container flex h-16 items-center justify-between gap-6">
          <Link to="/" aria-label="Vistora 3D home"><Logo /></Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn('rounded-md px-3 py-2 text-[13.5px] font-medium transition-colors', isActive ? 'text-brand-600' : 'text-ink-muted hover:text-ink')}>{n.label}</NavLink>
            ))}
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            {user ? (
              <Link to="/app" className={buttonVariants({ size: 'sm' })}>Open Dashboard</Link>
            ) : (
              <>
                <Link to="/login" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Login</Link>
                <Link to="/register" className={buttonVariants({ size: 'sm' })}>Get Started</Link>
              </>
            )}
          </div>
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? <X /> : <Menu />}
          </Button>
        </div>
        {open && (
          <nav className="border-t border-line bg-surface px-5 pb-5 pt-2 lg:hidden" aria-label="Mobile">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)} className={({ isActive }) => cn('block rounded-md px-2 py-2.5 text-sm font-medium', isActive ? 'text-brand-600' : 'text-ink')}>{n.label}</NavLink>
            ))}
            <div className="mt-3 grid grid-cols-2 gap-2">
              {user ? <Link to="/app" className={cn(buttonVariants(), 'col-span-2')}>Open Dashboard</Link> : (
                <><Link to="/login" className={buttonVariants({ variant: 'secondary' })}>Login</Link><Link to="/register" className={buttonVariants()}>Get Started</Link></>
              )}
            </div>
          </nav>
        )}
      </header>
      <main id="main" className="flex-1"><Outlet /></main>
      <Footer />
    </div>
  );
}

function Footer() {
  const cols = [
    { title: 'Product', links: [['Features', '/features'], ['How It Works', '/how-it-works'], ['Pricing', '/pricing'], ['Create 3D', '/app/create']] },
    { title: 'Workflows', links: [['AI Reconstruction', '/features#ai'], ['Photogrammetry', '/features#photogrammetry'], ['Game-Ready Assets', '/features#game'], ['Professional Export', '/features#export']] },
    { title: 'Resources', links: [['Documentation', '/docs'], ['Capture Guide', '/docs#capture'], ['Export Guide', '/docs#export'], ['API', '/docs#api']] },
  ];
  return (
    <footer className="border-t border-line bg-canvas">
      <div className="container grid gap-10 py-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-ink-muted">From Every Angle to Every Detail. Multi-view AI reconstruction, photogrammetry and professional export in one workspace.</p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{c.title}</h4>
            <ul className="mt-3 space-y-2">
              {c.links.map(([l, to]) => <li key={l}><Link to={to} className="text-sm text-ink hover:text-brand-600">{l}</Link></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="container flex flex-col justify-between gap-2 py-5 text-xs text-ink-muted sm:flex-row">
          <span>© {new Date().getFullYear()} Vistora 3D</span>
          <span>Reconstruction quality depends on capture conditions. Results are measured, never guaranteed.</span>
        </div>
      </div>
    </footer>
  );
}
