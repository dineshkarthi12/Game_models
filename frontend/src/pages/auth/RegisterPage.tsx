import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label, FieldError } from '@/components/ui/input';
import { Callout } from '@/components/ui/misc';
import { authService, validatePassword } from '@/services/auth';
import { errorMessage } from '@/services/api';
import { GoogleButton } from './GoogleButton';

export default function RegisterPage() {
  const nav = useNavigate();
  const [form, setForm] = useState({ full_name: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState(false);
  const pwError = validatePassword(form.password);

  async function submit(e: FormEvent) {
    e.preventDefault(); setTouched(true); setError(null);
    if (pwError) return;
    setLoading(true);
    try {
      const u = await authService.register(form.email.trim(), form.password, form.full_name.trim());
      if (!u) setConfirmEmail(true); else nav('/app', { replace: true });
    } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); }
  }

  if (confirmEmail) return <Callout tone="success" title="Check your inbox">We sent a confirmation link to {form.email}. Confirm your email, then log in.</Callout>;

  return (
    <div>
      <h1 className="text-2xl font-bold">Create your account</h1>
      <p className="mt-1 text-sm text-ink-muted">Start on the Free plan with welcome credits. No card required.</p>
      <GoogleButton className="mt-6" />
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <div><Label htmlFor="name">Full name</Label><Input id="name" autoComplete="name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
        <div><Label htmlFor="email">Work email</Label><Input id="email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="new-password" required aria-invalid={touched && !!pwError} aria-describedby="pw-help" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <ul id="pw-help" className="mt-2 space-y-1 text-xs">
            {[['At least 8 characters', form.password.length >= 8], ['Letters and numbers', /[A-Za-z]/.test(form.password) && /\d/.test(form.password)]].map(([l, ok]) => (
              <li key={l as string} className={ok ? 'flex items-center gap-1.5 text-success' : 'flex items-center gap-1.5 text-ink-muted'}><Check className="size-3.5" />{l}</li>
            ))}
          </ul>
        </div>
        <FieldError>{error}</FieldError>
        <Button type="submit" className="w-full" loading={loading} disabled={!form.email || !form.password}>Create account</Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-muted">Already have an account? <Link to="/login" className="font-semibold text-brand-600 hover:underline">Log in</Link></p>
    </div>
  );
}
