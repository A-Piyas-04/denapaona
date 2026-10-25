import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell, SectionTitle } from '@/components/AppShell';
import { Badge, Button, Card, Sheet } from '@/components/ui';
import { ErrorState, ListSkeleton } from '@/components/States';
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
import { formatTaka } from '@/lib/money';
import { dateTime, timeLeft } from '@/lib/format';
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

  if (proposal.isLoading) return <AppShell title="Proposal" back><ListSkeleton /></AppShell>;
  if (!p) return <AppShell title="Proposal" back><ErrorState error={proposal.error} /></AppShell>;

  const parts = p.proposal_participants ?? [];
  const mine = parts.find((x) => x.user_id === me);
  const pending = p.status === 'pending' && new Date(p.expires_at) > new Date();
  const canDecide = pending && mine?.decision === 'pending';
  const leaderRecorded = (p.payload as SettlementPayload).leader_recorded;

  async function act(kind: 'approve' | 'reject' | 'cancel') {
    setBusy(kind);
    try {
      if (kind === 'cancel') {
        await rpc.cancelProposal(p!.id);
        toast('Withdrawn');
      } else {
        const r = await rpc.respond(p!.id, kind === 'approve');
        toast(
          r === 'approved' ? 'Approved by everyone — the ledger is updated'
          : r === 'pending' ? 'Your approval is recorded'
          : r === 'rejected' ? 'Declined — nothing changed'
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
      <Card>
        <p className="text-xs text-slate-500">
          <Link to={`/groups/${p.group_id}`} className="underline">{p.groups.name}</Link> · proposed by {name(p.proposer_id, { you: true })} · {dateTime(p.created_at)}
        </p>
        <p className="mt-2 text-lg font-medium text-slate-900">
          {describeProposal(p, (x) => name(x, { you: true }), voidExpense.data?.description)}
        </p>
        {p.note && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-sm text-slate-700">“{p.note}”</p>}
      </Card>

      {pending && pairs.data && (
        <Impact p={p} me={me} owes={pairs.data.owes} name={(x) => name(x, { you: true })} expense={voidExpense.data} />
      )}

      <SectionTitle>{pending ? 'Everyone must agree' : 'Outcome'}</SectionTitle>
      <Card className="divide-y divide-slate-100 p-0">
        {parts.map((x) => (
          <div key={x.user_id} className="flex items-center justify-between px-4 py-2.5 text-[15px]">
            <span>{name(x.user_id, { you: true })}{x.user_id === p.proposer_id && <span className="text-xs text-slate-500"> · proposer</span>}</span>
            {x.decision === 'approved' ? <Badge tone="owed">✓ approved</Badge>
              : x.decision === 'rejected' ? <Badge tone="owe">✗ declined</Badge>
              : <Badge tone="amber">waiting</Badge>}
          </div>
        ))}
      </Card>

      {pending ? (
        <p className="mt-2 text-xs text-slate-500">{timeLeft(p.expires_at)} · one “no” ends it — there’s no majority vote.</p>
      ) : (
        <Card className={p.status === 'approved' ? 'mt-3 border-owed/30 bg-owed-soft' : 'mt-3 bg-slate-50'}>
          <p className="text-[15px] font-medium text-slate-900">
            {leaderRecorded ? `Recorded by ${name(p.proposer_id)} (trip leader) — no approval needed inside an active trip`
              : proposalOutcome(p.status === 'pending' ? 'expired' : p.status, p.type)}
          </p>
          {p.resolved_at && <p className="text-xs text-slate-500">{dateTime(p.resolved_at)}</p>}
          {p.status === 'rejected' && <p className="mt-1 text-sm text-slate-600">A declined proposal can’t be revived. Anyone involved can make a new one.</p>}
        </Card>
      )}

      {canDecide && (
        <div className="sticky bottom-20 mt-6 grid grid-cols-2 gap-2">
          <Button size="lg" variant="outline" busy={busy === 'reject'} onClick={() => setConfirmReject(true)}>Decline</Button>
          <Button size="lg" busy={busy === 'approve'} onClick={() => act('approve')}>Approve</Button>
        </div>
      )}
      {pending && mine && mine.decision !== 'pending' && p.proposer_id !== me && (
        <p className="mt-4 text-center text-sm text-slate-500">You {mine.decision} this. Waiting for the others.</p>
      )}
      {pending && p.proposer_id === me && (
        <Button className="mt-4" block variant="ghost" busy={busy === 'cancel'} onClick={() => act('cancel')}>Withdraw this proposal</Button>
      )}

      <Sheet open={confirmReject} onClose={() => setConfirmReject(false)} title="Decline?">
        <p className="text-[15px] text-slate-700">Nothing will change, and you don’t have to give a reason. This can’t be undone — they’d need to propose again.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setConfirmReject(false)}>Back</Button>
          <Button variant="danger" busy={busy === 'reject'} onClick={() => act('reject')}>Decline</Button>
        </div>
      </Sheet>
    </AppShell>
  );
}

/** Before → after, computed from live balances (§13.3: comprehension is the product). */
function Impact({ p, me, owes, name, expense }: {
  p: { type: string; payload: unknown }; me: string;
  owes: (a: string, b: string) => number; name: (id: string) => string; expense?: Expense;
}) {
  const line = (a: string, b: string, v: number): ReactNode =>
    v === 0 ? `${name(a)} and ${name(b)} are square`
    : v > 0 ? `${name(a)} owe${name(a) === 'You' ? '' : 's'} ${name(b)} ${formatTaka(v)}`
    : `${name(b)} owe${name(b) === 'You' ? '' : 's'} ${name(a)} ${formatTaka(-v)}`;

  let rows: { a: string; b: string; before: number; after: number }[] = [];
  if (p.type === 'transfer') {
    const t = p.payload as TransferPayload;
    rows = [
      { a: t.debtor, b: t.intermediary, before: owes(t.debtor, t.intermediary), after: owes(t.debtor, t.intermediary) - t.amount },
      { a: t.intermediary, b: t.creditor, before: owes(t.intermediary, t.creditor), after: owes(t.intermediary, t.creditor) - t.amount },
      { a: t.debtor, b: t.creditor, before: owes(t.debtor, t.creditor), after: owes(t.debtor, t.creditor) + t.amount },
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
  return (
    <Card className="mt-3 space-y-2 bg-slate-50">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">If this goes through</p>
      {rows.map((r, i) => (
        <div key={i} className="text-[14px]">
          <p className="text-slate-500 line-through decoration-slate-300">{line(r.a, r.b, r.before)}</p>
          <p className="font-medium text-slate-900">→ {line(r.a, r.b, r.after)}</p>
        </div>
      ))}
      {p.type !== 'amendment' && p.type !== 'void' && (
        <p className="text-xs text-slate-500">Checked again against the live balance at the final approval. If the debt has changed by then, nothing happens and everyone is told why.</p>
      )}
    </Card>
  );
}
