import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui';

export function Landing() {
  const { userId, loading, signIn } = useAuth();
  const t = useT();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  if (!loading && userId) return <Navigate to="/groups" replace />;
  const joining = from?.startsWith('/join');
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-app flex-col justify-between bg-white px-6 py-10">
      <div>
        <img src="/icon.svg" alt="" width={56} height={56} className="rounded-2xl" />
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-slate-900">{t('app.name')}</h1>
        <p className="mt-2 text-lg text-slate-600">{t('app.tagline')}</p>
        <ul className="mt-8 space-y-3 text-[15px] text-slate-700">
          <li>• Split bills equally or by what each person ordered — exact to the poisha.</li>
          <li>• Hand a debt to someone else only if <em>everyone</em> involved agrees.</li>
          <li>• Tap “Why?” on any figure to see exactly where it came from.</li>
        </ul>
      </div>
      <div className="space-y-3">
        {joining && <p className="text-center text-sm text-slate-600">Sign in to join the group you were invited to.</p>}
        <Button size="lg" block onClick={() => signIn(from)} disabled={loading}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#fff" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"/></svg>
          {t('auth.google')}
        </Button>
        <p className="text-center text-xs text-slate-500">
          HishebNama tracks who owes whom. It never moves money.
        </p>
      </div>
    </div>
  );
}
