import { Link } from 'react-router-dom';
import { Badge, Card } from './ui';
import { describeProposal } from '@/lib/describe';
import { timeLeft } from '@/lib/format';
import type { Proposal } from '@/lib/types';

/** Inbox row (story C-04): group, what, who's still to answer, time remaining. */
export function ProposalCard({ proposal: p, groupName, name, me }: {
  proposal: Proposal; groupName?: string; name: (id: string) => string; me: string;
}) {
  const waiting = (p.proposal_participants ?? []).filter((pp) => pp.decision === 'pending' && pp.user_id !== me);
  return (
    <Link to={`/proposals/${p.id}`} className="block">
      <Card className="p-3 hover:border-slate-300">
        <div className="flex items-center justify-between gap-2">
          <Badge tone="brand">{{ transfer: 'Transfer', settlement: 'Payment', amendment: 'Correction', void: 'Cancellation' }[p.type]}</Badge>
          <span className="text-xs text-slate-500">{timeLeft(p.expires_at)}</span>
        </div>
        <p className="mt-2 text-[15px] text-slate-800">{describeProposal(p, name)}</p>
        <p className="mt-1 text-xs text-slate-500">
          {groupName && <>{groupName} · </>}from {name(p.proposer_id)}
          {waiting.length > 0 && <> · also waiting on {waiting.map((w) => name(w.user_id)).join(', ')}</>}
        </p>
      </Card>
    </Link>
  );
}
