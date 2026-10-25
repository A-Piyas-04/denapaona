import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Calendar, Flag, Map as MapIcon, RotateCcw, UserRound, Wallet } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Avatar, Badge, Banner, Button, Field, IconTile, ListGroup, ListRow, MoreMenu, Section, Sheet, Textarea } from '@/components/ui';
import { ErrorState, HeroSkeleton, ListSkeleton } from '@/components/States';
import { useToast } from '@/components/Toast';
import { useMe } from '@/hooks/useAuth';
import { useNames } from '@/hooks/useGroups';
import { useAttribution, useExpense } from '@/hooks/useGroupLedger';
import { useTrip, isLeaderNow } from '@/hooks/useTrips';
import { supabase } from '@/lib/supabase';
import { rpc } from '@/lib/rpc';
import { errorMessage } from '@/lib/errors';
import { dateTime, cn } from '@/lib/format';
import { formatTaka, splitEvenly } from '@/lib/money';
import type { Proposal } from '@/lib/types';

type Action = 'void' | 'propose' | 'dispute' | null;

/**
 * One expense, with the three correction paths (stories B-06, D-07, D-11):
 *  - leader of the ACTIVE trip it belongs to → void and re-enter immediately;
 *  - anyone in the split, anywhere else → propose cancelling (unanimous);
 *  - any member → "This doesn't look right" (flags, changes nothing).
 * The buttons shown are a courtesy; the database decides (§12.8).
 */
export function ExpenseDetail() {
  const { id: groupId = '', expenseId = '' } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const expense = useExpense(expenseId);
  const attribution = useAttribution(groupId);
  const { name } = useNames(groupId);
  const trip = useTrip(expense.data?.trip_id ?? '');
  const pendingVoid = useQuery({
    queryKey: ['pendingVoid', expenseId],
    queryFn: async () => {
      const { data } = await supabase.from('proposals').select('*').eq('type', 'void').eq('status', 'pending')
        .eq('payload->>expense_id', expenseId).limit(1);
      return (data?.[0] ?? null) as Proposal | null;
    },
  });
  const [action, setAction] = useState<Action>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (expense.isLoading) return <AppShell title="Expense" back><HeroSkeleton /><ListSkeleton /></AppShell>;
  if (expense.error || !expense.data) return <AppShell title="Expense" back><ErrorState error={expense.error} /></AppShell>;
  const e = expense.data;
  const a = attribution.data?.get(e.id);
  const voided = !!e.voided_at;
  const shares = (e.expense_shares ?? []).filter((s) => s.share_poisha > 0).sort((x, y) => y.share_poisha - x.share_poisha);
  const even = splitEvenly(e.total_poisha, shares.map((s) => s.user_id));
  const isEven = shares.every((s) => even.get(s.user_id) === s.share_poisha);
  const minShare = Math.min(...shares.map((s) => s.share_poisha));
  const involved = e.payer_id === me || shares.some((s) => s.user_id === me);
  const leader = !!e.trip_id && isLeaderNow(trip.data, me);
  const myDispute = e.entry_disputes?.find((d) => d.raised_by === me && d.status === 'open');
  const openDisputes = e.entry_disputes?.filter((d) => d.status === 'open') ?? [];
  const tripClosed = !!e.trip_id && trip.data?.trip.status === 'closed';

  async function submit() {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      if (action === 'void') {
        await rpc.voidExpense(e.id, reason.trim());
        toast('Expense cancelled. Now enter the corrected one.');
        void qc.invalidateQueries();
        navigate(`/trips/${e.trip_id}/add?from=${e.id}`, { replace: true });
      } else if (action === 'propose') {
        const pid = await rpc.proposeVoid(e.id, reason.trim());
        toast('Sent for approval to everyone in the split');
        navigate(`/proposals/${pid}`);
      } else if (action === 'dispute') {
        await rpc.raiseDispute(e.id, reason.trim());
        toast(e.trip_id ? 'Flagged for the trip leaders' : 'Flagged. Everyone in the group can see it.', 'info');
        void qc.invalidateQueries({ queryKey: ['expense', e.id] });
      }
      setAction(null); setReason('');
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
        { label: 'Void and re-enter', icon: RotateCcw, tone: 'danger', onClick: () => setAction('void'), hidden: !leader,
          hint: 'Leaders fix mistakes straight away' },
        { label: 'Propose cancelling', icon: Ban, onClick: () => setAction('propose'), hidden: leader || !involved || !!pendingVoid.data,
          hint: 'Everyone in the split must agree' },
        { label: 'This doesn’t look right', icon: Flag, onClick: () => setAction('dispute'), hidden: !!myDispute,
          hint: 'Flags it. No balance changes.' },
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
        <Banner icon={Ban}>
          {a?.voided_by_agreement ? 'Cancelled by agreement' : `Cancelled by ${name(e.voided_by)}${a?.voided_by_leader ? ' (trip leader)' : ''}`}: “{e.void_reason}”. It no longer counts.
        </Banner>
      )}
      {!voided && pendingVoid.data && (
        <Banner tone="pending" icon={Ban} to={`/proposals/${pendingVoid.data.id}`}>A cancellation is waiting for approval</Banner>
      )}

      <ListGroup>
        <ListRow leading={<IconTile><Wallet size={20} /></IconTile>} title={name(e.payer_id, { you: true })} subtitle="Paid by" />
        <ListRow leading={<IconTile><UserRound size={20} /></IconTile>}
                 title={<>{name(e.created_by, { you: true })}{a?.entered_by_leader && <span className="font-normal text-slate-500"> (trip leader)</span>}</>}
                 subtitle="Added by" />
        <ListRow leading={<IconTile><Calendar size={20} /></IconTile>} title={dateTime(e.created_at)} subtitle="Date" />
        {e.trip_id && trip.data && (
          <ListRow to={`/trips/${e.trip_id}`} leading={<IconTile tone="brand"><MapIcon size={20} /></IconTile>} title={trip.data.trip.name} subtitle="Trip" />
        )}
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

      {openDisputes.length > 0 && (
        <Section title="Questioned">
          <div className="space-y-2">
            {openDisputes.map((d) => (
              <div key={d.id} className="rounded-2xl bg-pending-soft px-4 py-3 text-[15px] text-slate-800">
                <p><span className="font-semibold">{name(d.raised_by, { you: true })}:</span> “{d.reason}”</p>
                <p className="mt-1 text-[13px] text-pending">A flag changes no balance.</p>
                {d.raised_by === me && (
                  <Button size="sm" variant="ghost" className="-ml-2 mt-1" onClick={async () => {
                    try { await rpc.withdrawDispute(d.id); void qc.invalidateQueries({ queryKey: ['expense', e.id] }); }
                    catch (err) { toast(errorMessage(err), 'error'); }
                  }}>Withdraw my flag</Button>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {!voided && (
        <div className="space-y-1 text-center">
          {tripClosed && !leader && <p className="text-[13px] text-slate-500">This trip is closed. Corrections need everyone in the split to agree.</p>}
          {!myDispute && (
            <button type="button" className="inline-flex items-center gap-1.5 py-2 text-[14px] font-medium text-slate-500 hover:text-slate-800" onClick={() => setAction('dispute')}>
              <Flag size={15} aria-hidden /> This doesn’t look right
            </button>
          )}
        </div>
      )}

      <Sheet open={action !== null} onClose={() => setAction(null)}
             title={action === 'void' ? 'Void and re-enter' : action === 'propose' ? 'Propose cancelling' : 'What looks wrong?'}
             footer={
               <div className="grid grid-cols-2 gap-2">
                 <Button variant="secondary" onClick={() => setAction(null)}>Cancel</Button>
                 <Button busy={busy} disabled={!reason.trim()} variant={action === 'void' ? 'danger' : 'primary'} onClick={submit}>
                   {action === 'void' ? 'Void it' : action === 'propose' ? 'Send' : 'Flag it'}
                 </Button>
               </div>
             }>
        <p className="mb-4 text-[15px] text-slate-600">
          {action === 'void' && 'Nothing is erased. Everyone sees who cancelled it and why. You then enter the right one.'}
          {action === 'propose' && `All ${people} people in the split must approve. Until then it still counts.`}
          {action === 'dispute' && (e.trip_id ? 'The trip leaders are told. No balance changes.' : 'Everyone sees your flag beside it. No balance changes.')}
        </p>
        <Field label="Reason" htmlFor="action-reason">
          <Textarea id="action-reason" autoFocus maxLength={300} value={reason} onChange={(ev) => setReason(ev.target.value)}
                    placeholder={action === 'dispute' ? 'I didn’t eat at this dinner' : 'Typed 1200, was 1100'} />
        </Field>
      </Sheet>
    </AppShell>
  );
}
