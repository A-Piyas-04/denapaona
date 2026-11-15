import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, HandCoins, History as HistoryIcon, Scale } from 'lucide-react';
import { Avatar, ListGroup, ListRow, Section } from './ui';
import { ListSkeleton, EmptyState } from './States';
import { SettlePairSheet } from './SettlePairSheet';
import { TransferPairSheet } from './TransferPairSheet';
import { Taka } from './Money';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/format';

export interface PairBalance {
  otherId: string;
  name: string;
  /** + they should give me, − I should give them. */
  poisha: number;
}

const historyPath = (groupId: string | undefined, otherId: string) =>
  groupId ? `/explain/${groupId}/${otherId}` : `/explain/${otherId}`;

/**
 * Per-person rows in two plain sections: "You need to give" and "You're
 * supposed to get".  Each row has History, Settle up, and Transfer.
 * Omit `groupId` for the global Home ledger.
 */
export function BalanceBreakdown({ groupId, me, pairs, people, owes, loading }: {
  groupId?: string;
  me: string;
  pairs: PairBalance[] | undefined;
  people: { id: string; name: string }[];
  owes: (a: string, b: string) => number;
  loading?: boolean;
}) {
  const t = useT();
  const [settle, setSettle] = useState<PairBalance | null>(null);
  const [transfer, setTransfer] = useState<PairBalance | null>(null);

  if (loading || !pairs) return <ListSkeleton rows={3} />;

  const give = pairs.filter((p) => p.poisha < 0).sort((a, b) => a.poisha - b.poisha);
  const get = pairs.filter((p) => p.poisha > 0).sort((a, b) => b.poisha - a.poisha);

  if (give.length === 0 && get.length === 0) {
    return <EmptyState icon={Scale} title={t('balance.allSettled')} body={t('balance.nobody')} />;
  }

  return (
    <div className="space-y-6" data-tour="balance-list">
      {([
        { key: 'give', label: t('balance.youNeedToGive'), rows: give, amountClass: 'text-owe' },
        { key: 'get', label: t('balance.youAreSupposedToGet'), rows: get, amountClass: 'text-owed' },
      ] as const)
        .filter((g) => g.rows.length > 0)
        .map((g) => (
          <Section key={g.key} title={g.label}>
            <ListGroup>
              {g.rows.map((p) => (
                <div key={p.otherId}>
                  <ListRow
                    to={historyPath(groupId, p.otherId)}
                    leading={<Avatar name={p.name} seed={p.otherId} />}
                    title={p.name}
                    trailing={
                      <Taka poisha={Math.abs(p.poisha)}
                            className={cn('text-[16px] font-semibold', g.amountClass)} />
                    }
                    chevron={false}
                    aria-label={`${p.name}, ${Math.abs(p.poisha)}`}
                  />
                  <div className="flex items-center gap-2 px-4 pb-3.5">
                    <RowAction to={historyPath(groupId, p.otherId)} icon={HistoryIcon} label={t('balance.history')} />
                    <RowAction onClick={() => setSettle(p)} icon={HandCoins} label={t('action.settleUp')} />
                    <RowAction onClick={() => setTransfer(p)} icon={ArrowLeftRight} label={t('action.transfer')} />
                  </div>
                </div>
              ))}
            </ListGroup>
          </Section>
        ))}

      {settle && (
        <SettlePairSheet
          open
          onClose={() => setSettle(null)}
          groupId={groupId}
          me={me}
          otherId={settle.otherId}
          otherName={settle.name}
          poisha={settle.poisha}
        />
      )}
      {transfer && (
        <TransferPairSheet
          open
          onClose={() => setTransfer(null)}
          groupId={groupId}
          me={me}
          otherId={transfer.otherId}
          otherName={transfer.name}
          poisha={transfer.poisha}
          people={people}
          owes={owes}
        />
      )}
    </div>
  );
}

function RowAction({ label, icon: Icon, to, onClick }: {
  label: string; icon: typeof HistoryIcon; to?: string; onClick?: () => void;
}) {
  const cls = 'pressable inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-night-elev px-2 text-[13px] font-semibold text-ink hover:bg-brand-soft hover:text-brand-ink';
  if (to) {
    return (
      <Link to={to} className={cls} onClick={(e) => e.stopPropagation()}>
        <Icon size={15} strokeWidth={2.1} aria-hidden />
        {label}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={(e) => { e.stopPropagation(); onClick?.(); }}>
      <Icon size={15} strokeWidth={2.1} aria-hidden />
      {label}
    </button>
  );
}
