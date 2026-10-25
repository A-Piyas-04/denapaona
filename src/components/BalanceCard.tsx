import { Link } from 'react-router-dom';
import { Scale } from 'lucide-react';
import { Avatar, ListGroup, ListRow, Section, StatHero } from './ui';
import { HeroSkeleton, ListSkeleton, EmptyState } from './States';
import { Taka } from './Money';
import { useT } from '@/lib/i18n';
import { formatTaka, sum } from '@/lib/money';
import { cn } from '@/lib/format';

export interface PairBalance {
  otherId: string;
  name: string;
  /** + they owe me, − I owe them. */
  poisha: number;
}

const whyPath = (groupId: string, otherId: string, tripId?: string) =>
  `/explain/${groupId}/${otherId}${tripId ? `?trip=${tripId}` : ''}`;

function WhyLink({ to, className }: { to: string; className?: string }) {
  const t = useT();
  return (
    <Link to={to} className={cn('inline-flex h-8 items-center rounded-full bg-slate-100 px-3 text-[13px] font-semibold text-slate-700 hover:bg-brand-soft hover:text-brand-ink', className)}>
      {t('balance.why')}
    </Link>
  );
}

/**
 * Story B-04: the headline figure.  It is the sum of the same integers shown in
 * the breakdown, so the two can never disagree by even a poisha (B-04#3).
 */
export function BalanceHero({ groupId, tripId, pairs, loading, onShowBreakdown, scopeLabel }: {
  groupId: string; tripId?: string; pairs: PairBalance[] | undefined; loading?: boolean;
  onShowBreakdown?: () => void; scopeLabel?: string;
}) {
  const t = useT();
  if (loading || !pairs) return <HeroSkeleton />;
  const net = sum(pairs.map((p) => p.poisha));
  const owing = pairs.filter((p) => p.poisha !== 0);
  const label = net > 0 ? t('balance.youreOwed') : net < 0 ? t('balance.youOwe') : (scopeLabel ?? 'Your balance');
  const sub = owing.length === 0 ? 'Nobody owes anybody here.'
    : owing.length === 1 ? (owing[0]!.poisha > 0 ? `${owing[0]!.name} owes you` : `You owe ${owing[0]!.name}`)
    : `Across ${owing.length} people`;
  const action = owing.length === 1
    ? <WhyLink to={whyPath(groupId, owing[0]!.otherId, tripId)} />
    : owing.length > 1 && onShowBreakdown
      ? <button type="button" onClick={onShowBreakdown} className="inline-flex h-8 items-center rounded-full bg-slate-100 px-3 text-[13px] font-semibold text-slate-700 hover:bg-brand-soft hover:text-brand-ink">See breakdown</button>
      : undefined;
  return (
    <StatHero data-tour="balance-hero" label={label} tone={net > 0 ? 'owed' : net < 0 ? 'owe' : 'neutral'}
              value={net === 0 ? <span className="text-slate-400">{t('balance.allSettled')}</span>
                : <span className={net > 0 ? 'text-owed' : 'text-owe'}>{formatTaka(Math.abs(net))}</span>}
              sub={sub} action={action} />
  );
}

/** Per-person rows, grouped into "You owe" and "You're owed", each with its "Why?" (§13.3). */
export function BalanceBreakdown({ groupId, tripId, pairs, loading }: {
  groupId: string; tripId?: string; pairs: PairBalance[] | undefined; loading?: boolean;
}) {
  const t = useT();
  if (loading || !pairs) return <ListSkeleton rows={2} />;
  const owe = pairs.filter((p) => p.poisha < 0).sort((a, b) => a.poisha - b.poisha);
  const owed = pairs.filter((p) => p.poisha > 0).sort((a, b) => b.poisha - a.poisha);
  if (owe.length === 0 && owed.length === 0) {
    return <EmptyState icon={Scale} title={t('balance.allSettled')} body="Nobody owes anybody here." />;
  }
  return (
    <div className="space-y-5">
      {[{ label: t('balance.youOwe'), rows: owe }, { label: t('balance.youreOwed'), rows: owed }]
        .filter((g) => g.rows.length > 0)
        .map((g) => (
          <Section key={g.label} title={g.label}>
            <ListGroup>
              {g.rows.map((p) => (
                <ListRow key={p.otherId}
                         leading={<Avatar name={p.name} seed={p.otherId} />}
                         title={p.name}
                         subtitle={p.poisha < 0 ? 'You owe them' : 'Owes you'}
                         trailing={
                           <span className="flex items-center gap-2.5">
                             <Taka poisha={Math.abs(p.poisha)} className={cn('text-[16px] font-semibold', p.poisha < 0 ? 'text-owe' : 'text-owed')} />
                             <WhyLink to={whyPath(groupId, p.otherId, tripId)} />
                           </span>
                         } />
              ))}
            </ListGroup>
          </Section>
        ))}
    </div>
  );
}
