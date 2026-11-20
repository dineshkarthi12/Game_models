import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import { formatBytes, formatDuration, titleCase } from '@/utils/format';
import { validatePassword } from '@/services/auth';
import { StatusBadge } from '@/components/ui/badge';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Pagination } from '@/components/Pagination';
import { OrientationGuide } from '@/features/upload/OrientationGuide';
import { useAuthStore } from '@/stores/auth';
import { TooltipProvider } from '@/components/ui/tooltip';

describe('format utilities', () => {
  it('formats bytes, durations and titles', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(4.6 * 1024 ** 2)).toBe('4.6 MB');
    expect(formatBytes(null)).toBe('—');
    expect(formatDuration(149)).toBe('2m 29s');
    expect(titleCase('queued_at_provider')).toBe('Queued At Provider');
  });
});

describe('password rules', () => {
  it('matches the server policy', () => {
    expect(validatePassword('short1')).toMatch(/8 characters/);
    expect(validatePassword('allletters')).toMatch(/letters and numbers/);
    expect(validatePassword('Sculpt3d2026')).toBeNull();
  });
});

describe('StatusBadge', () => {
  it('shows a human label and a live indicator only for running states', () => {
    const { container, rerender } = render(<StatusBadge status="in_progress" />);
    expect(screen.getByText('in progress')).toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
    rerender(<StatusBadge status="completed" />);
    expect(container.querySelector('.animate-pulse')).toBeNull();
  });
});

describe('ProtectedRoute', () => {
  it('redirects anonymous users to login with a next parameter', () => {
    useAuthStore.setState({ token: null, user: null });
    render(
      <MemoryRouter initialEntries={['/app/library?q=lion']}>
        <Routes>
          <Route element={<ProtectedRoute />}><Route path="/app/library" element={<p>library</p>} /></Route>
          <Route path="/login" element={<LoginProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('next').textContent).toBe('/app/library?q=lion');
  });
});
function LoginProbe() { const [p] = useSearchParams(); return <p data-testid="next">{p.get('next')}</p>; }

describe('Pagination', () => {
  it('reports the visible range and pages', async () => {
    const onPage = vi.fn();
    render(<Pagination page={2} pageSize={10} total={35} onPage={onPage} />);
    expect(screen.getByText('Showing 11–20 of 35')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Next page'));
    expect(onPage).toHaveBeenCalledWith(3);
  });
});

describe('OrientationGuide', () => {
  it('marks covered and missing camera angles accessibly', async () => {
    const onSelect = vi.fn();
    render(<TooltipProvider><OrientationGuide covered={new Set(['front', 'top'] as const)} onSelect={onSelect} /></TooltipProvider>);
    expect(screen.getByLabelText('Front covered')).toBeInTheDocument();
    expect(screen.getByLabelText('Back missing')).toBeInTheDocument();
    expect(screen.getByLabelText('Top covered')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Back missing'));
    expect(onSelect).toHaveBeenCalledWith('back');
  });
});
