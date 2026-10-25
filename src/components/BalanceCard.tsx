import { Link } from 'react-router-dom';
import { Card, Skeleton } from './ui';
import { Balance, Taka } from './Money';
import { useT } from '@/lib/i18n';
import { sum } from '@/lib/money';

export interface PairBalance {
  otherId: string;
  name: string;
  /** + they owe me, − I owe them. */
  poisha: number;
}

/**
 * Story B-04: one headline figure plus the per-person breakdown, grouped into
 * "You owe" and "You're owed".  The headline is the sum of the same integers
 * shown below it, so the two can never disagree by even a poisha (B-04#3).
 * Every figure carries a quiet "Why?" (§13.3).
 */
export function BalanceCard({ groupId, tripId, pairs, loading, scopeNote }: {
  groupId: string; tripId?: string; pairs: PairBalance[] | undefined; loading?: boolean; scopeNote?: string;
}) {
  const t = useT();
  if (loading || !pairs) {
    return (
      <Card className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-12 w-full" />
      </Card>
    );
  }
  const net = sum(pairs.map((p) => p.poisha));
  const owe = pairs.filter((p) => p.poisha < 0).sort((a, b) => a.poisha - b.poisha);
  const owed = pairs.filter((p) => p.poisha > 0).sort((a, b) => b.poisha - a.poisha);
  const why = (otherId: string) =>
    `/explain/${groupId}/${otherId}${tripId ? `?trip=${tripId}` : ''}`;

  return (
    <Card>
      <p className="text-sm text-slate-500">
        {net === 0 ? (scopeNote ?? 'Your position') : net > 0 ? t('balance.youreOwed') : t('balance.youOwe')}
      </p>
      <p className="mt-0.5 text-3xl">
        <Balance poisha={net} settledText={t('balance.allSettled')} className={net === 0 ? 'text-2xl font-semibold' : ''} />
      </p>
      {net === 0 && pairs.length === 0 && (
        <p className="mt-1 text-sm text-slate-500">Nobody owes anybody here. ✓</p>
      )}
      {[{ label: t('balance.youOwe'), rows: owe, prefix: 'to' }, { label: t('balance.youreOwed'), rows: owed, prefix: 'from' }]
        .filter((g) => g.rows.length > 0)
        .map((g) => (
          <div key={g.label} className="mt-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.label}</p>
            <ul className="divide-y divide-slate-100">
              {g.rows.map((p) => (
                <li key={p.otherId} className="flex items-center justify-between py-2">
                  <span className="text-[15px] text-slate-800">{g.prefix} {p.name}</span>
                  <span className="flex items-center gap-3">
                    <Taka poisha={Math.abs(p.poisha)} className={p.poisha < 0 ? 'font-medium text-owe' : 'font-medium text-owed'} />
                    <Link to={why(p.otherId)} className="text-xs font-medium text-slate-500 underline decoration-dotted underline-offset-2 hover:text-brand">
                      {t('balance.why')}
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </Card>
  );
}
