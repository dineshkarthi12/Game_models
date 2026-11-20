import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutGrid, Box, FolderKanban, Library, History, Crosshair, Download, Users, Settings, Bell, Search, Coins, Menu, X, LogOut,
  User as UserIcon, PanelLeftClose, PanelLeftOpen, Plus,
} from 'lucide-react';
import { Logo, LogoMark } from '@/components/brand/Logo';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownTrigger, DropdownContent, DropdownItem, DropdownSeparator, DropdownLabel } from '@/components/ui/dropdown';
import { Tooltip } from '@/components/ui/tooltip';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import { useMe, useNotifications } from '@/hooks/queries';
import { cn } from '@/utils/cn';
import { formatNumber } from '@/utils/format';

export const APP_NAV = [
  { to: '/app', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/app/create', label: 'Create 3D', icon: Box },
  { to: '/app/projects', label: 'My Projects', icon: FolderKanban },
  { to: '/app/library', label: 'Asset Library', icon: Library },
  { to: '/app/history', label: 'Recent Generations', icon: History },
  { to: '/app/precision', label: 'Precision Studio', icon: Crosshair },
  { to: '/app/exports', label: 'Export Center', icon: Download },
  { to: '/app/team', label: 'Team Workspace', icon: Users },
];

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const item = (n: (typeof APP_NAV)[number] | { to: string; label: string; icon: typeof Settings; end?: boolean }) => {
    const link = (
      <NavLink key={n.to} to={n.to} end={'end' in n ? n.end : false} onClick={onNavigate}
        className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors',
          collapsed && 'justify-center px-0', isActive ? 'bg-brand-50 text-brand-600' : 'text-ink-muted hover:bg-canvas hover:text-ink')}>
        <n.icon className="size-[18px] shrink-0" aria-hidden />
        <span className={cn(collapsed && 'sr-only')}>{n.label}</span>
      </NavLink>
    );
    return collapsed ? <Tooltip key={n.to} content={n.label} side="right">{link}</Tooltip> : link;
  };
  return (
    <nav className="flex flex-1 flex-col gap-0.5" aria-label="App">
      {APP_NAV.map(item)}
      <div className="mt-auto pt-4">{item({ to: '/app/settings', label: 'Settings', icon: Settings })}</div>
    </nav>
  );
}

export function AppLayout() {
  const { sidebarCollapsed, toggleSidebar, mobileNavOpen, setMobileNav } = useUIStore();
  const location = useLocation();
  useEffect(() => { setMobileNav(false); }, [location.pathname, setMobileNav]);

  return (
    <div className="flex min-h-screen bg-canvas">
      <a href="#app-main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      <aside className={cn('sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-surface px-3 pb-4 pt-4 transition-[width] duration-200 lg:flex', sidebarCollapsed ? 'w-[72px]' : 'w-[240px]')}>
        <div className={cn('mb-6 flex items-center px-2', sidebarCollapsed ? 'justify-center' : 'justify-between')}>
          <Link to="/app" aria-label="Vistora 3D dashboard">{sidebarCollapsed ? <LogoMark className="h-7" /> : <Logo />}</Link>
        </div>
        <SidebarNav collapsed={sidebarCollapsed} />
        <button onClick={toggleSidebar} className={cn('mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-ink-muted hover:bg-canvas', sidebarCollapsed && 'justify-center')}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {sidebarCollapsed ? <PanelLeftOpen className="size-4" /> : <><PanelLeftClose className="size-4" /> Collapse</>}
        </button>
      </aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setMobileNav(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[264px] flex-col bg-surface px-3 pb-4 pt-4 shadow-raised animate-fade-in">
            <div className="mb-6 flex items-center justify-between px-2">
              <Logo />
              <Button variant="ghost" size="icon-sm" aria-label="Close navigation" onClick={() => setMobileNav(false)}><X /></Button>
            </div>
            <SidebarNav collapsed={false} onNavigate={() => setMobileNav(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setMobileNav(true)} />
        <main id="app-main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8"><Outlet /></main>
      </div>
    </div>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const { data: me } = useMe();
  const { data: notes } = useNotifications();
  const unread = notes?.unread ?? 0;
  const [q, setQ] = useState('');
  const submit = (e: FormEvent) => { e.preventDefault(); navigate(`/app/library?q=${encodeURIComponent(q.trim())}`); };
  const initials = (me?.full_name || me?.email || '?').split(/[\s@]/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('');

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6 lg:px-8">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} aria-label="Open navigation"><Menu /></Button>
      <form onSubmit={submit} className="relative hidden max-w-md flex-1 sm:block" role="search">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects, models, assets…" aria-label="Search projects, models and assets"
          className="h-10 w-full rounded-lg border border-line bg-canvas pl-9 pr-3 text-sm placeholder:text-ink-subtle focus:border-brand-400 focus:bg-surface focus:shadow-focus focus:outline-none" />
      </form>
      <div className="ml-auto flex items-center gap-2">
        <Link to="/app/create" className="hidden md:block"><Button size="sm"><Plus /> New Model</Button></Link>
        <Link to="/app/notifications" className="relative rounded-lg p-2 text-ink-muted hover:bg-canvas hover:text-ink" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
          <Bell className="size-5" />
          {unread > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold leading-4 text-white">{unread > 9 ? '9+' : unread}</span>}
        </Link>
        <Link to="/app/settings?tab=billing" className="hidden items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-canvas sm:flex" aria-label="Credits balance">
          <Coins className="size-4 text-brand" /> {me ? formatNumber(me.credits) : '—'} <span className="font-medium text-ink-muted">credits</span>
        </Link>
        <DropdownMenu>
          <DropdownTrigger className="grid size-9 place-items-center overflow-hidden rounded-full bg-brand-100 text-[13px] font-bold text-brand-700" aria-label="Account menu">
            {me?.avatar_url ? <img src={me.avatar_url} alt="" className="size-full object-cover" /> : initials}
          </DropdownTrigger>
          <DropdownContent>
            <DropdownLabel>{me?.email}</DropdownLabel>
            <DropdownItem icon={<UserIcon />} onSelect={() => navigate('/app/profile')}>Profile</DropdownItem>
            <DropdownItem icon={<Settings />} onSelect={() => navigate('/app/settings')}>Settings</DropdownItem>
            <DropdownItem icon={<Coins />} onSelect={() => navigate('/app/settings?tab=billing')}>Plan & credits</DropdownItem>
            <DropdownSeparator />
            <DropdownItem icon={<LogOut />} onSelect={async () => { await logout(); navigate('/login'); }}>Log out</DropdownItem>
          </DropdownContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
