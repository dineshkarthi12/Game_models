import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input, Label, FieldError } from '@/components/ui/input';
import { Callout } from '@/components/ui/misc';
import { authService, validatePassword } from '@/services/auth';
import { errorMessage } from '@/services/api';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = params.get('token');
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const missing = authService.mode === 'local' && !token;

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    const v = validatePassword(pw); if (v) return setError(v);
    if (pw !== pw2) return setError('Passwords do not match');
    setLoading(true);
    try { await authService.reset(token, pw); nav('/login?reset=1', { replace: true }); } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); }
  }
  return (
    <div>
      <h1 className="text-2xl font-bold">Choose a new password</h1>
      {missing ? (
        <Callout tone="danger" className="mt-6" title="Missing reset token">Open the link from your email, or <Link className="font-semibold underline" to="/forgot-password">request a new one</Link>.</Callout>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div><Label htmlFor="pw">New password</Label><Input id="pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
          <div><Label htmlFor="pw2">Confirm password</Label><Input id="pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
          <FieldError>{error}</FieldError>
          <Button type="submit" className="w-full" loading={loading}>Update password</Button>
        </form>
      )}
    </div>
  );
}
