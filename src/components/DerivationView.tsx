import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card } from './ui';
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
    <ol className="space-y-2">
      {rows.map((r) => <Row key={r.entry_id} row={r} groupId={groupId} otherName={otherName} />)}
    </ol>
  );
}

function Row({ row: r, groupId, otherName }: { row: DerivationRow; groupId: string; otherName: string }) {
  const [open, setOpen] = useState(false);
  const d = r.detail;
  const hasMore = !!(d.rounding_note || d.note || (d.open_disputes ?? 0) > 0);
  const running = r.running_poisha;
  return (
    <li>
      <Card className={cn('p-3', r.cause_type === 'void' && 'bg-slate-50')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-slate-500">{shortDate(r.occurred_at)}</p>
            <p className={cn('text-[14px] leading-snug text-slate-800', r.cause_type === 'void' && 'italic')}>
              {r.cause_label}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {d.split_kind === 'rounding' && d.got_extra_poisha && <Badge tone="slate">+1 poisha rounding</Badge>}
              {d.split_kind === 'manual' && <Badge tone="slate">entered by hand</Badge>}
              {(d.entered_by_leader || d.leader_recorded) && <Badge tone="amber">leader action</Badge>}
              {(d.open_disputes ?? 0) > 0 && <Badge tone="amber">⚑ questioned</Badge>}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <Taka poisha={Math.abs(r.signed_poisha)}
                  className={cn('font-semibold', r.signed_poisha > 0 ? 'text-owed' : 'text-owe')} />
            <p className="text-[11px] text-slate-500">{r.signed_poisha > 0 ? `${otherName} owes you more` : 'you owe more'}</p>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-[13px]">
          <span className="text-slate-500">Running total</span>
          <span className={cn('font-medium tabular-nums', running > 0 ? 'text-owed' : running < 0 ? 'text-owe' : 'text-slate-500')}>
            {running === 0 ? 'square' : running > 0 ? <>{otherName} owes you <Taka poisha={running} /></> : <>you owe <Taka poisha={-running} /></>}
          </span>
        </div>
        {hasMore && (
          <button className="mt-1 text-xs font-medium text-brand" onClick={() => setOpen((o) => !o)}>
            {open ? 'Less' : 'More'}
          </button>
        )}
        {open && (
          <div className="mt-2 space-y-1 text-[13px] text-slate-600">
            {d.rounding_note && <p>{d.rounding_note}</p>}
            {d.note && <p>Note: “{d.note}”</p>}
            {d.expense_id && <Link to={`/groups/${groupId}/expenses/${d.expense_id}`} className="text-brand underline">Open this expense</Link>}
            {d.proposal_id && <Link to={`/proposals/${d.proposal_id}`} className="text-brand underline">Open this agreement</Link>}
          </div>
        )}
      </Card>
    </li>
  );
}
