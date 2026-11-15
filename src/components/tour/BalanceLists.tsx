import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui';
import type { TourBalancesView } from '@/hooks/useTours';
import { formatTourTaka } from '@/lib/tourMoney';
import { cn } from '@/lib/format';

export function BalanceLists({
  tourId,
  data,
}: {
  tourId: string;
  data: TourBalancesView;
}) {
  const qc = useQueryClient();
  const settled = data.give.length === 0 && data.get.length === 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 text-xs leading-relaxed text-ink-soft">
          Amounts are recorded obligations — the app never moves money.
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void qc.invalidateQueries({ queryKey: ['tour', tourId, 'balances'] })}
        >
          Refresh
        </Button>
      </div>

      {settled ? (
        <div className="rounded-2xl border border-owed/30 bg-owed/10 p-6 text-center">
          <p className="text-lg font-semibold text-owed">You&apos;re all settled up!</p>
          <p className="mt-1 text-sm text-ink-soft">No one owes you, and you owe no one.</p>
        </div>
      ) : (
        <>
          <Section title="Need to Give" rows={data.give} total={data.totalGive} tone="give" />
          <Section title="Supposed to Get" rows={data.get} total={data.totalGet} tone="get" />
        </>
      )}
    </div>
  );
}

function Section({
  title,
  rows,
  total,
  tone,
}: {
  title: string;
  rows: { userId: string; name: string; paisa: number }[];
  total: number;
  tone: 'give' | 'get';
}) {
  const accent = tone === 'give' ? 'text-owe' : 'text-owed';
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-night-line p-3 text-sm text-ink-soft">
          Nothing here.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-night-line/70 bg-paper shadow-soft">
          {rows.map((r) => (
            <li
              key={r.userId}
              className="flex items-center justify-between gap-3 border-b border-night-line/50 px-4 py-3 last:border-b-0"
            >
              <span className="min-w-0 break-words font-medium text-ink">{r.name}</span>
              <span className={cn('shrink-0 font-semibold tabular-nums', accent)}>
                {formatTourTaka(r.paisa)}
              </span>
            </li>
          ))}
          <li className="flex items-center justify-between bg-brand-muted/60 px-4 py-3">
            <span className="text-sm font-semibold text-ink-soft">Total</span>
            <span className={cn('font-bold tabular-nums', accent)}>{formatTourTaka(total)}</span>
          </li>
        </ul>
      )}
    </section>
  );
}
