import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Info, XCircle } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { DebtDiagram, type DebtEdge } from '@/components/DebtDiagram';
import { ApprovalDots, PROPOSAL_TYPE } from '@/components/ProposalCard';
import { Avatar, Badge, Button, IconTile, ListGroup, ListRow, Section, Sheet, StickyFooter } from '@/components/ui';
import { ErrorState, HeroSkeleton, ListSkeleton } from '@/components/States';
import { useToast } from '@/components/Toast';
import { useMe } from '@/hooks/useAuth';
import { useProposal } from '@/hooks/useProposals';
import { useProfileNames } from '@/hooks/useProfiles';
import { useAllPairs } from '@/hooks/usePairs';
import { useExpense } from '@/hooks/useGroupLedger';
import { useRealtimeGroup } from '@/hooks/useRealtimeProposals';
import { rpc } from '@/lib/rpc';
import { errorMessage, proposalOutcome } from '@/lib/errors';
import { describeProposal } from '@/lib/describe';
import { dateTime, timeLeft, cn } from '@/lib/format';
import type { AmendmentPayload, Expense, SettlementPayload, TransferPayload, VoidPayload } from '@/lib/types';

/**
 * Proposal detail with approve / decline (stories C-02, C-03, C-05, C-08,
 * F-02).  Approval state updates live; terminal states are explained in plain
 * language, never as raw status strings (§13.3).
 */
export function ProposalDetail() {
  const { id = '' } = useParams();
  const me = useMe();
  const proposal = useProposal(id);
  const p = proposal.data;
  useRealtimeGroup(p?.group_id);
  const pairs = useAllPairs(p?.group_id ?? '');
  const voidExpense = useExpense(p?.type === 'void' ? (p.payload as VoidPayload).expense_id : '');
  const ids = p ? [p.proposer_id, ...(p.proposal_participants ?? []).map((x) => x.user_id)] : [];
  const name = useProfileNames(ids);
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<'approve' | 'reject' | 'cancel' | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);

  if (proposal.isLoading) return <AppShell title="Request" back><HeroSkeleton /><ListSkeleton /></AppShell>;
  if (!p) return <AppShell title="Request" back><ErrorState error={proposal.error} /></AppShell>;

  const parts = p.proposal_participants ?? [];
  const mine = parts.find((x) => x.user_id === me);
  const pending = p.status === 'pending' && new Date(p.expires_at) > new Date();
  const canDecide = pending && mine?.decision === 'pending';
  const leaderRecorded = (p.payload as SettlementPayload).leader_recorded;
  const type = PROPOSAL_TYPE[p.type];
  const TypeIcon = type.icon;
  const agreed = parts.filter((x) => x.decision === 'approved').length;
  const outcome = leaderRecorded ? `Recorded by ${name(p.proposer_id)} (trip leader). No approval needed inside an active trip.`
    : proposalOutcome(p.status === 'pending' ? 'expired' : p.status, p.type);

  async function act(kind: 'approve' | 'reject' | 'cancel') {
    setBusy(kind);
    try {
      if (kind === 'cancel') {
        await rpc.cancelProposal(p!.id);
        toast('Request withdrawn');
      } else {
        const r = await rpc.respond(p!.id, kind === 'approve');
        toast(
          r === 'approved' ? 'Approved by everyone. Balances updated.'
          : r === 'pending' ? 'Approved. Waiting for the others.'
          : r === 'rejected' ? 'Declined. Nothing changed.'
          : proposalOutcome(r, p!.type),
          r === 'invalidated' || r === 'expired' ? 'info' : 'ok',
        );
      }
      void qc.invalidateQueries();
    } catch (e) {
      toast(errorMessage(e), 'error');
      void qc.invalidateQueries({ queryKey: ['proposal', id] });
    } finally {
      setBusy(null); setConfirmReject(false);
    }
  }

  return (
    <AppShell title={{ transfer: 'Debt transfer', settlement: 'Payment', amendment: 'Correction', void: 'Cancel an expense' }[p.type]} back>
      <div className="rounded-3xl border border-slate-200/80 bg-white px-5 py-5">
        <div className="flex items-center gap-3">
          <IconTile tone="brand"><TypeIcon size={20} /></IconTile>
          <div className="min-w-0 text-[13px] text-slate-500">
            <Link to={`/groups/${p.group_id}`} className="block truncate font-semibold text-slate-700 hover:underline">{p.groups.name}</Link>
            From {name(p.proposer_id, { you: true })}, {dateTime(p.created_at)}
          </div>
        </div>
        <p className="mt-4 font-display text-[20px] font-semibold leading-snug text-slate-900">
          {describeProposal(p, (x) => name(x, { you: true }), voidExpense.data?.description)}
        </p>
        {p.note && <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-[15px] text-slate-700">“{p.note}”</p>}
      </div>

      {pending && pairs.data && (
        <Impact p={p} me={me} owes={pairs.data.owes} name={(x) => name(x, { you: true })} expense={voidExpense.data} />
      )}

      <Section title={pending ? 'Everyone must agree' : 'Responses'} action={<ApprovalDots agreed={agreed} total={parts.length} />}>
        <ListGroup>
          {parts.map((x) => (
            <ListRow key={x.user_id}
                     leading={<Avatar name={name(x.user_id)} seed={x.user_id} />}
                     title={name(x.user_id, { you: true })}
                     subtitle={x.user_id === p.proposer_id ? 'Proposed this' : undefined}
                     trailing={x.decision === 'approved' ? <Badge tone="owed"><CheckCircle2 size={12} aria-hidden /> Agreed</Badge>
                       : x.decision === 'rejected' ? <Badge tone="owe"><XCircle size={12} aria-hidden /> Declined</Badge>
                       : <Badge tone="amber"><Clock size={12} aria-hidden /> Waiting</Badge>} />
          ))}
        </ListGroup>
        {pending && <p className="mt-2 px-1 text-[13px] text-slate-500">{timeLeft(p.expires_at)}. One “no” ends it.</p>}
      </Section>

      {!pending && (
        <div className={cn('flex items-start gap-3 rounded-2xl px-4 py-4',
                          p.status === 'approved' ? 'bg-owed-soft text-owed' : 'bg-slate-100 text-slate-700')}>
          {p.status === 'approved' ? <CheckCircle2 size={20} className="mt-0.5 shrink-0" aria-hidden /> : <Info size={20} className="mt-0.5 shrink-0" aria-hidden />}
          <div>
            <p className="text-[15px] font-semibold">{outcome}</p>
            {p.resolved_at && <p className="mt-0.5 text-[13px] opacity-80">{dateTime(p.resolved_at)}</p>}
            {p.status === 'rejected' && <p className="mt-1 text-[14px]">Anyone involved can make a new request.</p>}
          </div>
        </div>
      )}

      {pending && mine && mine.decision !== 'pending' && p.proposer_id !== me && (
        <p className="text-center text-[15px] text-slate-500">You {mine.decision === 'approved' ? 'agreed' : 'declined'}. Waiting for the others.</p>
      )}

      {canDecide && (
        <StickyFooter>
          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" variant="outline" className="h-14 rounded-2xl" busy={busy === 'reject'} onClick={() => setConfirmReject(true)}>Decline</Button>
            <Button size="lg" className="h-14 rounded-2xl" busy={busy === 'approve'} onClick={() => act('approve')}>Approve</Button>
          </div>
        </StickyFooter>
      )}
      {pending && p.proposer_id === me && (
        <Button block variant="ghost" className="text-owe hover:bg-owe-soft" busy={busy === 'cancel'} onClick={() => act('cancel')}>Withdraw request</Button>
      )}

      <Sheet open={confirmReject} onClose={() => setConfirmReject(false)} title="Decline this request?"
             footer={
               <div className="grid grid-cols-2 gap-2">
                 <Button variant="secondary" onClick={() => setConfirmReject(false)}>Back</Button>
                 <Button variant="danger" busy={busy === 'reject'} onClick={() => act('reject')}>Decline</Button>
               </div>
             }>
        <p className="text-[15px] text-slate-700">Nothing will change, and no reason is needed. They’d have to send a new request.</p>
      </Sheet>
    </AppShell>
  );
}

/** Before → after, computed from live balances (§13.3: comprehension is the product). */
function Impact({ p, me, owes, name, expense }: {
  p: { type: string; payload: unknown }; me: string;
  owes: (a: string, b: string) => number; name: (id: string) => string; expense?: Expense;
}) {
  let rows: { a: string; b: string; before: number; after: number }[] = [];
  if (p.type === 'transfer') {
    const t = p.payload as TransferPayload;
    rows = [
      { a: t.debtor, b: t.creditor, before: owes(t.debtor, t.creditor), after: owes(t.debtor, t.creditor) + t.amount },
      { a: t.debtor, b: t.intermediary, before: owes(t.debtor, t.intermediary), after: owes(t.debtor, t.intermediary) - t.amount },
      { a: t.intermediary, b: t.creditor, before: owes(t.intermediary, t.creditor), after: owes(t.intermediary, t.creditor) - t.amount },
    ];
  } else if (p.type === 'settlement') {
    const s = p.payload as SettlementPayload;
    rows = [{ a: s.debtor, b: s.creditor, before: owes(s.debtor, s.creditor), after: owes(s.debtor, s.creditor) - s.amount }];
  } else if (p.type === 'amendment') {
    const a = p.payload as AmendmentPayload;
    const d = a.direction === 'increase' ? a.amount : -a.amount;
    rows = [{ a: a.from_user, b: a.to_user, before: owes(a.from_user, a.to_user), after: owes(a.from_user, a.to_user) + d }];
  } else if (p.type === 'void' && expense) {
    // C-08#5: what MY balance with each affected person becomes.
    const shares = (expense.expense_shares ?? []).filter((s) => s.share_poisha > 0 && s.user_id !== expense.payer_id);
    const affected = expense.payer_id === me ? shares : shares.filter((s) => s.user_id === me);
    rows = affected.map((s) => ({
      a: s.user_id, b: expense.payer_id,
      before: owes(s.user_id, expense.payer_id), after: owes(s.user_id, expense.payer_id) - s.share_poisha,
    }));
  }
  if (rows.length === 0) return null;
  const before: DebtEdge[] = rows.filter((r) => r.before !== 0 || p.type !== 'transfer').map((r) => ({ a: r.a, b: r.b, v: r.before }));
  const after: DebtEdge[] = rows.map((r) => ({ a: r.a, b: r.b, v: r.after }));
  return (
    <Section title="If this goes through">
      <DebtDiagram name={name} before={before} after={after} highlight={0} />
      {p.type !== 'amendment' && p.type !== 'void' && (
        <p className="mt-2 px-1 text-[13px] text-slate-500">Checked again at the final approval. If the debt has changed, nothing happens.</p>
      )}
    </Section>
  );
}
