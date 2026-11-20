import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner, Callout } from '@/components/ui/misc';
import { authService } from '@/services/auth';
import { errorMessage } from '@/services/api';

export default function OAuthCallbackPage() {
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { authService.completeOAuth().then(() => nav('/app', { replace: true })).catch((e) => setError(errorMessage(e))); }, [nav]);
  return error ? <Callout tone="danger" title="Sign-in failed">{error}</Callout> : <div className="grid place-items-center py-10"><Spinner /></div>;
}
