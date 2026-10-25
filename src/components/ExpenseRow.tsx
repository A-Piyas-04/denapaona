import { Link } from 'react-router-dom';
import { Badge } from './ui';
import { Taka } from './Money';
import { dateTime, cn } from '@/lib/format';
import type { Expense } from '@/lib/types';
import type { Attribution } from '@/lib/rpc';

/**
 * One expense.  "Paid by" and "added by" are always shown distinctly (§13.3),
 * leader actions are labelled, and a voided expense is struck through with who
 * cancelled it and why — never hidden (B-05#2).
 */
export function ExpenseRow({ expense: e, groupId, me, name, attribution }: {
  expense: Expense; groupId: string; me: string;
  name: (id: string | null) => string; attribution?: Attribution;
}) {
  const mine = e.expense_shares?.find((s) => s.user_id === me)?.share_poisha ?? 0;
  const voided = !!e.voided_at;
  const openDisputes = e.entry_disputes?.filter((d) => d.status === 'open').length ?? 0;
  const enteredBy = e.created_by !== e.payer_id || attribution?.entered_by_leader;
  return (
    <Link to={`/groups/${groupId}/expenses/${e.id}`}
          className="block rounded-2xl border border-slate-200 bg-white p-3 hover:border-slate-300">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn('truncate font-medium text-slate-900', voided && 'text-slate-400 line-through')}>{e.description}</p>
          <p className="mt-0.5 text-[13px] text-slate-500">
            paid by {name(e.payer_id)}
            {enteredBy && (
              <> · added by {name(e.created_by)}{attribution?.entered_by_leader && ' (trip leader)'}</>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <Taka poisha={e.total_poisha} className={cn('font-semibold', voided ? 'text-slate-400 line-through' : 'text-slate-900')} />
          {!voided && mine > 0 && e.payer_id !== me && (
            <p className="text-[13px] text-owe">your share <Taka poisha={mine} /></p>
          )}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-slate-500">
        <span>{dateTime(e.created_at)}</span>
        {voided && (
          <Badge tone="slate">
            {attribution?.voided_by_agreement
              ? `Cancelled by agreement — ${e.void_reason}`
              : `Voided by ${name(e.voided_by)}${attribution?.voided_by_leader ? ' (trip leader)' : ''} — ${e.void_reason}`}
          </Badge>
        )}
        {openDisputes > 0 && <Badge tone="amber">⚑ questioned</Badge>}
      </div>
    </Link>
  );
}
