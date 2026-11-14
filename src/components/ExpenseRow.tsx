import { Link } from 'react-router-dom';
import { Receipt } from 'lucide-react';
import { Taka } from './Money';
import { cn } from '@/lib/format';
import type { Expense } from '@/lib/types';

function DateTile({ iso, muted }: { iso: string; muted?: boolean }) {
  const d = new Date(iso);
  return (
    <span className={cn('flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl leading-none',
                        muted ? 'bg-slate-50 text-slate-400' : 'bg-slate-100 text-slate-600')} aria-hidden>
      <span className="text-[11px] font-semibold">{d.toLocaleDateString(undefined, { month: 'short' })}</span>
      <span className="mt-0.5 font-display text-[17px] font-semibold">{d.getDate()}</span>
    </span>
  );
}

/**
 * One expense.  "Paid by" and "added by" are always shown distinctly (§13.3),
 * and a voided expense is struck through with the reason — never hidden
 * (B-05#2).  Render inside a ListGroup.
 */
export function ExpenseRow({ expense: e, groupId, me, name, dateTile = true }: {
  expense: Expense; groupId: string; me: string;
  name: (id: string | null) => string;
  /** Off where rows already sit under a date heading. */
  dateTile?: boolean;
}) {
  const mine = e.expense_shares?.find((s) => s.user_id === me)?.share_poisha ?? 0;
  const voided = !!e.voided_at;
  const lent = e.payer_id === me ? e.total_poisha - mine : 0;

  const subtitle = voided
    ? `Cancelled by agreement: ${e.void_reason}`
    : `Paid by ${name(e.payer_id)}${e.created_by !== e.payer_id ? `, added by ${name(e.created_by)}` : ''}`;

  return (
    <Link to={`/groups/${groupId}/expenses/${e.id}`}
          className="flex min-h-[64px] items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 active:bg-slate-100">
      {dateTile ? <DateTile iso={e.created_at} muted={voided} /> : (
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', voided ? 'bg-slate-50 text-slate-400' : 'bg-slate-100 text-slate-600')} aria-hidden>
          <Receipt size={20} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-[16px] font-medium text-slate-900', voided && 'text-slate-400 line-through')}>{e.description}</span>
        <span className="mt-0.5 block truncate text-[13px] text-slate-500">{subtitle}</span>
      </span>
      <span className="shrink-0 text-right">
        <Taka poisha={e.total_poisha} className={cn('block text-[16px] font-semibold', voided ? 'text-slate-400 line-through' : 'text-slate-900')} />
        {!voided && (lent > 0
          ? <span className="block text-[12px] font-medium text-owed">you lent <Taka poisha={lent} /></span>
          : mine > 0 && e.payer_id !== me
            ? <span className="block text-[12px] font-medium text-owe">your share <Taka poisha={mine} /></span>
            : <span className="block text-[12px] text-slate-400">not involved</span>)}
      </span>
    </Link>
  );
}
