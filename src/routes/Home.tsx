import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Scale, Users } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { BalanceBreakdown } from '@/components/BalanceCard';
import { RecordClaimSheet } from '@/components/RecordClaimSheet';
import { IconButton } from '@/components/ui';
import { EmptyState, Loadable, ScreenSkeleton } from '@/components/States';
import { Taka } from '@/components/Money';
import { useMe } from '@/hooks/useAuth';
import { useGlobalPairs } from '@/hooks/useGlobalLedger';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/format';

/** Global pairwise home — balances across all outing expenses and claims. */
export function Home() {
  const me = useMe();
  const t = useT();
  const pairs = useGlobalPairs();
  const [recording, setRecording] = useState(false);

  const people = useMemo(
    () => (pairs.data ?? []).map((p) => ({ id: p.otherId, name: p.name })),
    [pairs.data],
  );

  const owes = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of pairs.data ?? []) {
      // p.poisha: + they owe me => owes(them, me) = p.poisha; owes(me, them) = -p.poisha
      map.set(`${p.otherId}|${me}`, p.poisha);
      map.set(`${me}|${p.otherId}`, -p.poisha);
    }
    return (a: string, b: string) => map.get(`${a}|${b}`) ?? 0;
  }, [pairs.data, me]);

  const totalGet = (pairs.data ?? []).filter((p) => p.poisha > 0).reduce((s, p) => s + p.poisha, 0);
  const totalGive = (pairs.data ?? []).filter((p) => p.poisha < 0).reduce((s, p) => s + -p.poisha, 0);

  return (
    <AppShell
      title={t('home.title')}
      action={
        <IconButton label={t('home.record')} tone="brand" onClick={() => setRecording(true)}>
          <Plus size={22} />
        </IconButton>
      }
    >
      <Loadable query={pairs} skeleton={<ScreenSkeleton variant="dashboard" />}>
        {(list) => (
          <div className="space-y-5">
            <div className="grid grid-cols-2 overflow-hidden rounded-3xl border border-night-line/70 bg-paper text-ink shadow-soft">
              <div className="px-5 py-5">
                <p className="text-[13px] font-medium text-ink-soft">{t('balance.youAreSupposedToGet')}</p>
                <Taka
                  poisha={totalGet}
                  className={cn(
                    'mt-1.5 block font-display text-[26px] font-semibold tracking-tight tnum',
                    totalGet ? 'text-owed' : 'text-ink-soft/40',
                  )}
                />
              </div>
              <div className="border-l border-night-line/70 px-5 py-5">
                <p className="text-[13px] font-medium text-ink-soft">{t('balance.youNeedToGive')}</p>
                <Taka
                  poisha={totalGive}
                  className={cn(
                    'mt-1.5 block font-display text-[26px] font-semibold tracking-tight tnum',
                    totalGive ? 'text-owe' : 'text-ink-soft/40',
                  )}
                />
              </div>
            </div>

            {list.length === 0 ? (
              <EmptyState
                icon={Scale}
                title={t('home.empty.title')}
                body={t('home.empty.body')}
              >
                <button
                  type="button"
                  className="pressable inline-flex h-12 w-full items-center justify-center rounded-xl bg-brand px-5 text-base font-semibold text-brand-fg"
                  onClick={() => setRecording(true)}
                >
                  {t('home.record')}
                </button>
                <Link
                  to="/groups"
                  className="pressable inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-brand"
                >
                  <Users size={18} aria-hidden /> {t('home.empty.groups')}
                </Link>
              </EmptyState>
            ) : (
              <BalanceBreakdown
                me={me}
                pairs={list}
                people={people}
                owes={owes}
                loading={pairs.isLoading}
              />
            )}
          </div>
        )}
      </Loadable>

      <RecordClaimSheet open={recording} onClose={() => setRecording(false)} />
    </AppShell>
  );
}
