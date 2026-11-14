import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Ban, Calendar, UserRound, Wallet } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Avatar, Badge, Banner, Button, Field, IconTile, ListGroup, ListRow, MoreMenu, Section, Sheet, Textarea } from '@/components/ui';
import { ErrorState, HeroSkeleton, ListSkeleton } from '@/components/States';
import { useToast } from '@/components/Toast';
import { useMe } from '@/hooks/useAuth';
import { useNames } from '@/hooks/useGroups';
import { useExpense } from '@/hooks/useGroupLedger';
import { supabase } from '@/lib/supabase';
import { rpc } from '@/lib/rpc';
import { errorMessage } from '@/lib/errors';
import { dateTime, cn } from '@/lib/format';
import { formatTaka, splitEvenly } from '@/lib/money';
import type { Proposal } from '@/lib/types';

/**
 * One expense, with its correction path (story B-06): anyone in the split can
 * propose cancelling it, and everyone in the split must agree.  The button
 * shown is a courtesy; the database decides.
 */
export function ExpenseDetail() {
  const { id: groupId = '', expenseId = '' } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const toast = useToast();
  const expense = useExpense(expenseId);
  const { name } = useNames(groupId);
  const pendingVoid = useQuery({
    queryKey: ['pendingVoid', expenseId],
    queryFn: async () => {
      const { data } = await supabase.from('proposals').select('*').eq('type', 'void').eq('status', 'pending')
        .eq('payload->>expense_id', expenseId).limit(1);
      return (data?.[0] ?? null) as Proposal | null;
    },
  });
  const [proposing, setProposing] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (expense.isLoading) return <AppShell title="Expense" back><HeroSkeleton /><ListSkeleton /></AppShell>;
  if (expense.error || !expense.data) return <AppShell title="Expense" back><ErrorState error={expense.error} /></AppShell>;
  const e = expense.data;
  const voided = !!e.voided_at;
  const shares = (e.expense_shares ?? []).filter((s) => s.share_poisha > 0).sort((x, y) => y.share_poisha - x.share_poisha);
  const even = splitEvenly(e.total_poisha, shares.map((s) => s.user_id));
  const isEven = shares.every((s) => even.get(s.user_id) === s.share_poisha);
  const minShare = Math.min(...shares.map((s) => s.share_poisha));
  const involved = e.payer_id === me || shares.some((s) => s.user_id === me);

  async function submit() {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      const pid = await rpc.proposeVoid(e.id, reason.trim());
      toast('Sent for approval to everyone in the split');
      navigate(`/proposals/${pid}`);
      setProposing(false); setReason('');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  const people = shares.length + (shares.some((s) => s.user_id === e.payer_id) ? 0 : 1);

  return (
    <AppShell title="Expense" back action={!voided ? (
      <MoreMenu title={e.description} items={[
        { label: 'Propose cancelling', icon: Ban, onClick: () => setProposing(true), hidden: !involved || !!pendingVoid.data,
          hint: 'Everyone in the split must agree' },
      ]} />
    ) : undefined}>
      <div className="rounded-3xl border border-slate-200/80 bg-white px-5 py-5 text-center">
        <p className={cn('text-[16px] font-medium', voided ? 'text-slate-400 line-through' : 'text-slate-600')}>{e.description}</p>
        <p className={cn('mt-1 font-display text-[36px] font-semibold tnum', voided ? 'text-slate-400 line-through' : 'text-slate-900')}>
          {formatTaka(e.total_poisha)}
        </p>
        {voided && <Badge className="mt-2">Cancelled</Badge>}
      </div>

      {voided && (
        <Banner icon={Ban}>Cancelled by agreement: “{e.void_reason}”. It no longer counts.</Banner>
      )}
      {!voided && pendingVoid.data && (
        <Banner tone="pending" icon={Ban} to={`/proposals/${pendingVoid.data.id}`}>A cancellation is waiting for approval</Banner>
      )}

      <ListGroup>
        <ListRow leading={<IconTile><Wallet size={20} /></IconTile>} title={name(e.payer_id, { you: true })} subtitle="Paid by" />
        <ListRow leading={<IconTile><UserRound size={20} /></IconTile>} title={name(e.created_by, { you: true })} subtitle="Added by" />
        <ListRow leading={<IconTile><Calendar size={20} /></IconTile>} title={dateTime(e.created_at)} subtitle="Date" />
      </ListGroup>

      <Section title={`Split ${shares.length} ways, ${isEven ? 'equally' : 'by hand'}`}>
        <ListGroup>
          {shares.map((s) => (
            <ListRow key={s.user_id} leading={<Avatar name={name(s.user_id)} seed={s.user_id} />} title={name(s.user_id, { you: true })}
                     trailing={
                       <span className="text-[15px] font-medium text-slate-900 tnum">
                         {formatTaka(s.share_poisha)}
                         {isEven && s.share_poisha > minShare && <span className="ml-1 text-xs font-normal text-slate-500">+1 poisha</span>}
                       </span>
                     } />
          ))}
        </ListGroup>
        {isEven && shares.some((s) => s.share_poisha > minShare) && (
          <p className="mt-2 px-1 text-[13px] text-slate-500">Leftover poisha go to people in a fixed order, never at random.</p>
        )}
      </Section>

      <Sheet open={proposing} onClose={() => setProposing(false)} title="Propose cancelling"
             footer={
               <div className="grid grid-cols-2 gap-2">
                 <Button variant="secondary" onClick={() => setProposing(false)}>Cancel</Button>
                 <Button busy={busy} disabled={!reason.trim()} onClick={submit}>Send</Button>
               </div>
             }>
        <p className="mb-4 text-[15px] text-slate-600">All {people} people in the split must approve. Until then it still counts.</p>
        <Field label="Reason" htmlFor="action-reason">
          <Textarea id="action-reason" autoFocus maxLength={300} value={reason} onChange={(ev) => setReason(ev.target.value)}
                    placeholder="Typed 1200, was 1100" />
        </Field>
      </Sheet>
    </AppShell>
  );
}
