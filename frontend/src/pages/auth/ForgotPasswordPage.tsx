import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label, FieldError } from '@/components/ui/input';
import { authService } from '@/services/auth';
import { errorMessage } from '@/services/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null); setLoading(true);
    try { await authService.forgot(email.trim()); setSent(true); } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); }
  }
  return (
    <div>
      <Link to="/login" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"><ArrowLeft className="size-4" /> Back to login</Link>
      {sent ? (
        <div>
          <div className="grid size-12 place-items-center rounded-xl bg-success-50 text-success"><MailCheck className="size-6" /></div>
          <h1 className="mt-4 text-2xl font-bold">Check your email</h1>
          <p className="mt-2 text-sm text-ink-muted">If an account exists for <strong className="text-ink">{email}</strong>, you will receive a link to reset your password. The link expires in 1 hour.</p>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-bold">Reset your password</h1>
          <p className="mt-1 text-sm text-ink-muted">Enter the email you signed up with and we'll send a reset link.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div><Label htmlFor="email">Email</Label><Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <FieldError>{error}</FieldError>
            <Button type="submit" className="w-full" loading={loading} disabled={!email}>Send reset link</Button>
          </form>
        </>
      )}
    </div>
  );
}
