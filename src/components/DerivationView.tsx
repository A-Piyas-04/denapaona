import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Flag, Star } from 'lucide-react';
import { Badge } from './ui';
import { Taka } from './Money';
import { shortDate, cn } from '@/lib/format';
import type { DerivationRow } from '@/lib/types';

/**
 * Feature 4.5 — "Why do I owe this?"  Every contributing entry in order, with
 * a plain-language cause and the running total after it, so the number can be
 * followed line by line (story E-01).  Rounding is stated explicitly (E-02).
 */
export function DerivationView({ rows, groupId, otherName }: {
  rows: DerivationRow[]; groupId: string; otherName: string;
}) {
  return (
    <ol className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
      {rows.map((r, i) => <Row key={r.entry_id} row={r} groupId={groupId} otherName={otherName} last={i === rows.length - 1} />)}
    </ol>
  );
}

function Row({ row: r, groupId, otherName, last }: { row: DerivationRow; groupId: string; otherName: string; last: boolean }) {
  const [open, setOpen] = useState(false);
  const d = r.detail;
  const hasMore = !!(d.rounding_note || d.note || d.expense_id || d.proposal_id);
  const running = r.running_poisha;
  const isVoid = r.cause_type === 'void';
  const up = r.signed_poisha > 0;
  return (
    <li className={cn('relative flex gap-3 px-4 py-3.5', !last && 'border-b border-slate-100', isVoid && 'bg-slate-50/70')}>
      <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', up ? 'bg-owed' : 'bg-owe')} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={cn('text-[15px] leading-snug text-slate-900', isVoid && 'italic text-slate-600')}>{r.cause_label}</p>
            <p className="mt-0.5 text-[12px] text-slate-500">{shortDate(r.occurred_at)}</p>
          </div>
          <span className={cn('shrink-0 text-[15px] font-semibold tnum', up ? 'text-owed' : 'text-owe')}>
            {up ? '+' : '−'}<Taka poisha={Math.abs(r.signed_poisha)} />
          </span>
        </div>
        {(d.split_kind === 'manual' || (d.split_kind === 'rounding' && d.got_extra_poisha) || d.entered_by_leader || d.leader_recorded || (d.open_disputes ?? 0) > 0) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {d.split_kind === 'rounding' && d.got_extra_poisha && <Badge>+1 poisha rounding</Badge>}
            {d.split_kind === 'manual' && <Badge>Entered by hand</Badge>}
            {(d.entered_by_leader || d.leader_recorded) && <Badge tone="amber"><Star size={11} className="fill-current" aria-hidden /> Leader action</Badge>}
            {(d.open_disputes ?? 0) > 0 && <Badge tone="amber"><Flag size={11} aria-hidden /> Questioned</Badge>}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between gap-2 text-[13px]">
          <span className={cn('tnum', running > 0 ? 'text-owed' : running < 0 ? 'text-owe' : 'text-slate-500')}>
            {running === 0 ? 'Square after this' : running > 0
              ? <>Then {otherName} owes you <Taka poisha={running} /></>
              : <>Then you owe <Taka poisha={-running} /></>}
          </span>
          {hasMore && (
            <button type="button" className="inline-flex items-center gap-0.5 font-semibold text-slate-500 hover:text-slate-800"
                    aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {open ? 'Less' : 'Details'}
              <ChevronDown size={15} className={cn('transition-transform duration-200', open && 'rotate-180')} aria-hidden />
            </button>
          )}
        </div>
        {open && (
          <div className="mt-2 space-y-1.5 rounded-xl bg-slate-50 p-3 text-[13px] text-slate-600">
            {d.rounding_note && <p>{d.rounding_note}</p>}
            {d.note && <p>Note: “{d.note}”</p>}
            {d.expense_id && <Link to={`/groups/${groupId}/expenses/${d.expense_id}`} className="block font-semibold text-brand">Open this expense</Link>}
            {d.proposal_id && <Link to={`/proposals/${d.proposal_id}`} className="block font-semibold text-brand">Open this agreement</Link>}
          </div>
        )}
      </div>
    </li>
  );
}
