import { Link } from 'react-router-dom';
import { ArrowLeftRight, Ban, Clock, HandCoins, PencilLine, type LucideIcon } from 'lucide-react';
import { IconTile } from './ui';
import { describeProposal } from '@/lib/describe';
import { timeLeft, cn } from '@/lib/format';
import type { Proposal } from '@/lib/types';

export const PROPOSAL_TYPE: Record<Proposal['type'], { label: string; icon: LucideIcon }> = {
  transfer: { label: 'Transfer', icon: ArrowLeftRight },
  settlement: { label: 'Payment', icon: HandCoins },
  amendment: { label: 'Correction', icon: PencilLine },
  void: { label: 'Cancellation', icon: Ban },
};

/** Approval progress as dots: filled for each person who agreed. */
export function ApprovalDots({ agreed, total }: { agreed: number; total: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600">
      <span className="flex gap-1" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cn('h-2 w-2 rounded-full', i < agreed ? 'bg-owed' : 'bg-slate-200')} />
        ))}
      </span>
      {agreed} of {total} agreed
    </span>
  );
}

/** Inbox row (story C-04): what, which group, who's still to answer, time remaining. */
export function ProposalCard({ proposal: p, groupName, name, me, ...rest }: {
  proposal: Proposal; groupName?: string; name: (id: string) => string; me: string; 'data-tour'?: string;
}) {
  const parts = p.proposal_participants ?? [];
  const agreed = parts.filter((pp) => pp.decision === 'approved').length;
  const waiting = parts.filter((pp) => pp.decision === 'pending' && pp.user_id !== me);
  const type = PROPOSAL_TYPE[p.type];
  const Icon = type.icon;
  return (
    <Link to={`/proposals/${p.id}`} {...rest}
          className="block rounded-2xl border border-slate-200/80 bg-white p-4 transition-colors hover:border-slate-300 active:bg-slate-50">
      <div className="flex items-start gap-3">
        <IconTile tone="brand"><Icon size={20} /></IconTile>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-brand">{type.label}</p>
            <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-slate-500">
              <Clock size={13} aria-hidden /> {timeLeft(p.expires_at)}
            </span>
          </div>
          <p className="mt-0.5 text-[15px] leading-snug text-slate-900">{describeProposal(p, name)}</p>
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="truncate text-[13px] text-slate-500">
              {groupName ? `${groupName}, from ${name(p.proposer_id)}` : `From ${name(p.proposer_id)}`}
            </span>
            <ApprovalDots agreed={agreed} total={parts.length} />
          </div>
          {waiting.length > 0 && (
            <p className="mt-1 truncate text-[12px] text-slate-400">Waiting on {waiting.map((w) => name(w.user_id)).join(', ')}</p>
          )}
        </div>
      </div>
    </Link>
  );
}
