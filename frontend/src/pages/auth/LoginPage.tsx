import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input, Label, FieldError } from '@/components/ui/input';
import { Callout } from '@/components/ui/misc';
import { authService } from '@/services/auth';
import { errorMessage } from '@/services/api';
import { GoogleButton } from './GoogleButton';

export default function LoginPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const next = params.get('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/app';

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null); setLoading(true);
    try { await authService.login(email.trim(), password); nav(safeNext, { replace: true }); }
    catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Welcome back</h1>
      <p className="mt-1 text-sm text-ink-muted">Log in to continue reconstructing.</p>
      {params.get('reset') === '1' && <Callout tone="success" className="mt-5">Your password was updated. Log in with your new password.</Callout>}
      <GoogleButton className="mt-6" />
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <div><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div>
          <div className="flex items-center justify-between"><Label htmlFor="password">Password</Label><Link to="/forgot-password" className="mb-1.5 text-xs font-semibold text-brand-600 hover:underline">Forgot password?</Link></div>
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <FieldError>{error}</FieldError>
        <Button type="submit" className="w-full" loading={loading} disabled={!email || !password}>Log in</Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-muted">New to Vistora 3D? <Link to="/register" className="font-semibold text-brand-600 hover:underline">Create an account</Link></p>
    </div>
  );
}
