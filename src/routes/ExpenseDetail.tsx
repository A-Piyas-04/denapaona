import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, SectionTitle } from '@/components/AppShell';
import { Badge, Button, Card, Field, Sheet, Textarea } from '@/components/ui';
import { ErrorState, ListSkeleton } from '@/components/States';
import { Taka } from '@/components/Money';
import { useToast } from '@/components/Toast';
import { useMe } from '@/hooks/useAuth';
import { useNames } from '@/hooks/useGroups';
import { useAttribution, useExpense } from '@/hooks/useGroupLedger';
import { useTrip, isLeaderNow } from '@/hooks/useTrips';
import { supabase } from '@/lib/supabase';
import { rpc } from '@/lib/rpc';
import { errorMessage } from '@/lib/errors';
import { dateTime } from '@/lib/format';
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

  if (expense.isLoading) return <AppShell title="Expense" back><ListSkeleton /></AppShell>;
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

  async function submit() {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      if (action === 'void') {
        await rpc.voidExpense(e.id, reason.trim());
        toast('Cancelled. Now enter the corrected expense.');
        void qc.invalidateQueries();
        navigate(`/trips/${e.trip_id}/add?from=${e.id}`, { replace: true });
      } else if (action === 'propose') {
        const pid = await rpc.proposeVoid(e.id, reason.trim());
        toast('Sent to everyone in the split for approval');
        navigate(`/proposals/${pid}`);
      } else if (action === 'dispute') {
        await rpc.raiseDispute(e.id, reason.trim());
        toast(e.trip_id ? 'Flagged for the trip leaders to review' : 'Flagged — everyone in the group can see it', 'info');
        void qc.invalidateQueries({ queryKey: ['expense', e.id] });
      }
      setAction(null); setReason('');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title={e.description} back>
      <Card>
        <div className="flex items-start justify-between">
          <div>
            <p className={voided ? 'text-2xl font-semibold text-slate-400 line-through' : 'text-2xl font-semibold'}>
              <Taka poisha={e.total_poisha} />
            </p>
            <p className="mt-1 text-sm text-slate-600">paid by <strong>{name(e.payer_id, { you: true })}</strong></p>
            <p className="text-sm text-slate-600">
              added by <strong>{name(e.created_by, { you: true })}</strong>{a?.entered_by_leader && ' (trip leader)'} · {dateTime(e.created_at)}
            </p>
            {e.trip_id && trip.data && (
              <Link to={`/trips/${e.trip_id}`} className="text-sm text-brand">on {trip.data.trip.name}</Link>
            )}
          </div>
          {voided && <Badge>cancelled</Badge>}
        </div>
        {voided && (
          <p className="mt-3 rounded-lg bg-slate-100 p-2 text-sm text-slate-700">
            {a?.voided_by_agreement ? 'Cancelled by agreement' : `Voided by ${name(e.voided_by)}${a?.voided_by_leader ? ' (trip leader)' : ''}`}
            {' '}— “{e.void_reason}”. It counts for nothing now, and both the original and the cancellation stay in history.
          </p>
        )}
      </Card>

      <SectionTitle>Split {shares.length} ways {isEven ? 'equally' : '— entered by hand'}</SectionTitle>
      <Card className="p-3">
        <ul className="divide-y divide-slate-100">
          {shares.map((s) => (
            <li key={s.user_id} className="flex justify-between py-1.5 text-[15px]">
              <span>{name(s.user_id, { you: true })}</span>
              <span className="tabular-nums">
                {formatTaka(s.share_poisha)}
                {isEven && s.share_poisha > minShare && <span className="ml-1 text-xs text-slate-500">+1 poisha</span>}
              </span>
            </li>
          ))}
        </ul>
        {isEven && shares.some((s) => s.share_poisha > minShare) && (
          <p className="mt-2 text-xs text-slate-500">
            {formatTaka(e.total_poisha)} didn’t divide evenly. Leftover poisha go to people in a fixed, repeatable order (by account id) — not at random, not targeted.
          </p>
        )}
      </Card>

      {openDisputes.length > 0 && (
        <>
          <SectionTitle>Questioned</SectionTitle>
          <div className="space-y-2">
            {openDisputes.map((d) => (
              <Card key={d.id} className="border-amber-200 bg-amber-50 p-3 text-sm">
                <p><strong>{name(d.raised_by, { you: true })}</strong>: “{d.reason}”</p>
                <p className="mt-1 text-xs text-amber-800">A flag changes no balance. {e.trip_id ? 'A trip leader can void and re-enter it.' : 'It can be cancelled by agreement.'}</p>
                {d.raised_by === me && (
                  <Button size="sm" variant="ghost" className="mt-1" onClick={async () => {
                    try { await rpc.withdrawDispute(d.id); void qc.invalidateQueries({ queryKey: ['expense', e.id] }); }
                    catch (err) { toast(errorMessage(err), 'error'); }
                  }}>Withdraw my flag</Button>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      {!voided && (
        <div className="mt-6 space-y-2">
          {pendingVoid.data && (
            <Link to={`/proposals/${pendingVoid.data.id}`} className="block rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
              A cancellation is waiting for approval →
            </Link>
          )}
          {leader && <Button block variant="danger" onClick={() => setAction('void')}>Void and re-enter</Button>}
          {!leader && involved && !pendingVoid.data && (
            <Button block variant="outline" onClick={() => setAction('propose')}>Propose cancelling this</Button>
          )}
          {!leader && e.trip_id && trip.data?.trip.status === 'closed' && (
            <p className="text-center text-xs text-slate-500">This trip is closed — corrections now need everyone in the split to agree.</p>
          )}
          {!myDispute && (
            <button className="block w-full py-2 text-center text-sm text-slate-500 underline decoration-dotted" onClick={() => setAction('dispute')}>
              This doesn’t look right
            </button>
          )}
        </div>
      )}

      <Sheet open={action !== null} onClose={() => setAction(null)}
             title={action === 'void' ? 'Void and re-enter' : action === 'propose' ? 'Propose cancelling' : 'What looks wrong?'}>
        <p className="mb-3 text-sm text-slate-600">
          {action === 'void' && 'This appends a cancellation — nothing is edited or deleted — and everyone affected sees who did it and why. You’ll then enter the corrected expense.'}
          {action === 'propose' && `Everyone in the split must approve (${shares.length + (shares.some((s) => s.user_id === e.payer_id) ? 0 : 1)} people). Until then the expense still counts.`}
          {action === 'dispute' && (e.trip_id ? 'Your flag notifies the trip leaders and appears beside this expense. It doesn’t change any balance.' : 'Your flag appears beside this expense for everyone. It doesn’t change any balance.')}
        </p>
        <Field label="Reason" htmlFor="action-reason">
          <Textarea id="action-reason" autoFocus maxLength={300} value={reason} onChange={(ev) => setReason(ev.target.value)}
                    placeholder={action === 'dispute' ? 'I didn’t eat at this dinner' : 'typed 1200, was 1100'} />
        </Field>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setAction(null)}>Cancel</Button>
          <Button busy={busy} disabled={!reason.trim()} variant={action === 'void' ? 'danger' : 'primary'} onClick={submit}>
            {action === 'void' ? 'Void it' : action === 'propose' ? 'Send' : 'Flag it'}
          </Button>
        </div>
      </Sheet>
    </AppShell>
  );
}
