import { ArrowDown, Check } from 'lucide-react';
import { Avatar } from './ui';
import { formatTaka } from '@/lib/money';
import { cn } from '@/lib/format';

/** `v > 0`: a owes b.  `v < 0`: b owes a.  `0`: square. */
export interface DebtEdge { a: string; b: string; v: number }

function EdgeRow({ e, name, emphasis }: { e: DebtEdge; name: (id: string) => string; emphasis?: boolean }) {
  const [from, to] = e.v >= 0 ? [e.a, e.b] : [e.b, e.a];
  const fromName = name(from);
  const toName = name(to);
  const owes = fromName === 'You' ? 'owe' : 'owes';
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="flex shrink-0 -space-x-2">
        <Avatar name={fromName} seed={from} size={30} className="ring-2 ring-white" />
        <Avatar name={toName} seed={to} size={30} className="ring-2 ring-white" />
      </span>
      {e.v === 0 ? (
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[15px] text-slate-500">
          <Check size={16} className="text-owed" aria-hidden /> {fromName} and {toName === 'You' ? 'you' : toName} are square
        </span>
      ) : (
        <>
          <span className={cn('min-w-0 flex-1 text-[15px]', emphasis ? 'font-semibold text-slate-900' : 'text-slate-700')}>
            {fromName} {owes} {toName === 'You' ? 'you' : toName}
          </span>
          <span className={cn('shrink-0 text-[15px] tnum', emphasis ? 'font-semibold text-slate-900' : 'font-medium text-slate-700')}>
            {formatTaka(Math.abs(e.v))}
          </span>
        </>
      )}
    </li>
  );
}

/**
 * Before → after, side by side in time (§13.3: "Users will not approve what
 * they do not understand, and comprehension is the product").
 */
export function DebtDiagram({ before, after, name, beforeLabel = 'Right now', afterLabel = 'After', highlight }: {
  before: DebtEdge[]; after: DebtEdge[]; name: (id: string) => string;
  beforeLabel?: string; afterLabel?: string;
  /** Index in `after` of the edge that is the point of the change. */
  highlight?: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
      <p className="text-[13px] font-semibold text-slate-500">{beforeLabel}</p>
      <ul className="divide-y divide-slate-100">{before.map((e, i) => <EdgeRow key={i} e={e} name={name} />)}</ul>
      <div className="my-1 flex items-center gap-2 text-slate-300" aria-hidden>
        <span className="h-px flex-1 bg-slate-200" /><ArrowDown size={16} /><span className="h-px flex-1 bg-slate-200" />
      </div>
      <p className="text-[13px] font-semibold text-brand">{afterLabel}</p>
      <ul className="divide-y divide-slate-100">
        {after.map((e, i) => <EdgeRow key={i} e={e} name={name} emphasis={i === highlight} />)}
      </ul>
    </div>
  );
}
