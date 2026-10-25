import { Navigate, useLocation } from 'react-router-dom';
import { Receipt, SearchCheck, ShieldCheck, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui';

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Receipt, title: 'Split any bill', body: 'Equally or item by item, exact to the poisha.' },
  { icon: ShieldCheck, title: 'Agree before it changes', body: 'Debts only move when everyone involved says yes.' },
  { icon: SearchCheck, title: 'See why you owe', body: 'Tap “Why?” on any balance to follow the maths.' },
];

export function Landing() {
  const { userId, loading, signIn } = useAuth();
  const t = useT();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  if (!loading && userId) return <Navigate to="/groups" replace />;
  const joining = from?.startsWith('/join');
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-app flex-col bg-white px-6 pb-8 pt-14 sm:border-x sm:border-slate-200/70">
      <div className="flex-1">
        <img src="/icon.svg" alt="" width={56} height={56} className="rounded-2xl" />
        <h1 className="mt-8 text-[34px] font-semibold leading-tight text-slate-900" translate="no">{t('app.name')}</h1>
        <p className="mt-3 max-w-[20rem] text-[17px] leading-relaxed text-slate-600">{t('app.tagline')}</p>
        <ul className="mt-12 space-y-6">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand" aria-hidden>
                <Icon size={22} strokeWidth={1.9} />
              </span>
              <div>
                <p className="text-[16px] font-semibold text-slate-900">{title}</p>
                <p className="mt-0.5 text-[15px] text-slate-500">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-12 space-y-4">
        {joining && <p className="text-center text-[15px] text-slate-600">Sign in to join the group you were invited to.</p>}
        <Button size="lg" variant="outline" block onClick={() => signIn(from)} disabled={loading} className="h-14 rounded-2xl border-slate-300 text-[16px]">
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          {t('auth.google')}
        </Button>
        <p className="text-center text-[13px] text-slate-500">Tracks who owes whom. Never moves money.</p>
      </div>
    </div>
  );
}
