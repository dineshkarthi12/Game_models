import { Link } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
export default function NotFoundPage() {
  return (
    <div className="container grid min-h-[60vh] place-items-center text-center">
      <div><p className="text-sm font-bold text-brand">404</p><h1 className="mt-2 text-3xl font-bold">Page not found</h1>
        <p className="mt-2 text-ink-muted">The page you are looking for does not exist or was moved.</p>
        <Link to="/" className={`${buttonVariants()} mt-6`}>Back to home</Link></div>
    </div>
  );
}
