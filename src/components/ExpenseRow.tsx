import { Link } from 'react-router-dom';
import { Flag, Receipt } from 'lucide-react';
import { Taka } from './Money';
import { cn } from '@/lib/format';
import type { Expense } from '@/lib/types';
import type { Attribution } from '@/lib/rpc';

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
 * leader actions are labelled, and a voided expense is struck through with who
 * cancelled it — never hidden (B-05#2).  Render inside a ListGroup.
 */
export function ExpenseRow({ expense: e, groupId, me, name, attribution, dateTile = true }: {
  expense: Expense; groupId: string; me: string;
  name: (id: string | null) => string; attribution?: Attribution;
  /** Off where rows already sit under a date heading. */
  dateTile?: boolean;
}) {
  const mine = e.expense_shares?.find((s) => s.user_id === me)?.share_poisha ?? 0;
  const voided = !!e.voided_at;
  const openDisputes = e.entry_disputes?.filter((d) => d.status === 'open').length ?? 0;
  const enteredBy = e.created_by !== e.payer_id || attribution?.entered_by_leader;
  const lent = e.payer_id === me ? e.total_poisha - mine : 0;

  const subtitle = voided
    ? `${attribution?.voided_by_agreement ? 'Cancelled by agreement'
      : `Cancelled by ${name(e.voided_by)}${attribution?.voided_by_leader ? ' (trip leader)' : ''}`}: ${e.void_reason}`
    : `Paid by ${name(e.payer_id)}${enteredBy ? `, added by ${name(e.created_by)}${attribution?.entered_by_leader ? ' (trip leader)' : ''}` : ''}`;

  return (
    <Link to={`/groups/${groupId}/expenses/${e.id}`}
          className="flex min-h-[64px] items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 active:bg-slate-100">
      {dateTile ? <DateTile iso={e.created_at} muted={voided} /> : (
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', voided ? 'bg-slate-50 text-slate-400' : 'bg-slate-100 text-slate-600')} aria-hidden>
          <Receipt size={20} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={cn('truncate text-[16px] font-medium text-slate-900', voided && 'text-slate-400 line-through')}>{e.description}</span>
          {openDisputes > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-pending-soft px-1.5 py-0.5 text-[11px] font-semibold text-pending">
              <Flag size={11} aria-hidden /> Questioned
            </span>
          )}
        </span>
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
