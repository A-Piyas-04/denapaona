import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell, SectionTitle } from '@/components/AppShell';
import { BalanceCard } from '@/components/BalanceCard';
import { ExpenseRow } from '@/components/ExpenseRow';
import { LeaderBadge, LeaderExplainer } from '@/components/LeaderBadge';
import { Badge, Button, Card, Chip, Field, Input, Segmented, Sheet } from '@/components/ui';
import { ErrorState, ListSkeleton } from '@/components/States';
import { Balance, Taka } from '@/components/Money';
import { useToast } from '@/components/Toast';
import { useTripView } from '@/hooks/useTripView';
import { useTripNets } from '@/hooks/useTrips';
import { useAttribution } from '@/hooks/useGroupLedger';
import { useRealtimeGroup } from '@/hooks/useRealtimeProposals';
import { rpc } from '@/lib/rpc';
import { errorMessage } from '@/lib/errors';
import { formatTaka, isPartialTakaInput, parseTakaToPoisha } from '@/lib/money';
import type { EntryMode } from '@/lib/types';

/** Trip dashboard — stories D-09, D-12, D-08, E-04. */
export function TripDashboard() {
  const { id: tripId = '' } = useParams();
  const v = useTripView(tripId);
  useRealtimeGroup(v.groupId || undefined);
  const nets = useTripNets(tripId);
  const attribution = useAttribution(v.groupId, tripId);
  const qc = useQueryClient();
  const toast = useToast();
  const [recording, setRecording] = useState(false);

  if (v.trip.isLoading) return <AppShell title="Trip" back><ListSkeleton /></AppShell>;
  if (v.trip.error || !v.trip.data) return <AppShell title="Trip" back><ErrorState error={v.trip.error} /></AppShell>;
  const { trip, leaders } = v.trip.data;
  const active = trip.status === 'active';
  const canAdd = active && (trip.entry_mode === 'open' || v.isLeader);
  const leaderNames = leaders.map((l) => v.name(l.user_id, { you: true }));

  return (
    <AppShell title={trip.name} back={`/groups/${trip.group_id}/trips`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone={active ? 'brand' : 'slate'}>{active ? 'active' : 'closed'}</Badge>
        <Badge>{trip.entry_mode === 'open' ? 'anyone on the trip adds' : 'leaders add'}</Badge>
      </div>

      <Card className="mb-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-slate-500">Trip so far</p>
            <p className="text-2xl font-semibold"><Taka poisha={v.runningTotal} /></p>
          </div>
          <Link to={`/trips/${tripId}/leaders`} className="text-right text-sm">
            <p className="text-slate-500">Leaders</p>
            <p className="font-medium text-slate-900">{leaderNames.join(', ')}</p>
          </Link>
        </div>
        <div className="mt-2"><LeaderExplainer /></div>
      </Card>

      {!active && (
        <p className="mb-3 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
          This trip is closed — leaders can no longer change anything, and corrections now need both people to agree.
          Outstanding amounts are ordinary group debts.
        </p>
      )}

      <BalanceCard groupId={trip.group_id} tripId={tripId} pairs={v.myEntries.data ? v.pairs : undefined}
                   loading={v.myEntries.isLoading} scopeNote="Your position on this trip" />
      <p className="mt-1 px-1 text-xs text-slate-500">
        From this trip only. <Link to={`/groups/${trip.group_id}`} className="text-brand underline">Your full group position</Link>
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {canAdd ? (
          <Link to={`/trips/${tripId}/add`} className="col-span-2"><Button block size="lg">+ Add expense</Button></Link>
        ) : active ? (
          <p className="col-span-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
            Only leaders add expenses on this trip. Ask {leaderNames.join(' or ')}.
          </p>
        ) : null}
        {v.isLeader && <Button variant="outline" onClick={() => setRecording(true)}>Record a payment</Button>}
        <Link to={`/trips/${tripId}/close`} className={v.isLeader ? '' : 'col-span-2'}>
          <Button block variant="outline">{active ? 'Settle & close' : 'Settle up'}</Button>
        </Link>
      </div>

      {v.isLeader && <EntryModeToggle tripId={tripId} mode={trip.entry_mode} />}
      {!active && leaders.some((l) => l.user_id === v.me) && (
        <Button variant="ghost" size="sm" className="mt-3" onClick={async () => {
          try { await rpc.reopenTrip(tripId); toast('Trip reopened — everyone on it can see that you did'); void qc.invalidateQueries(); }
          catch (e) { toast(errorMessage(e), 'error'); }
        }}>Reopen trip</Button>
      )}

      <SectionTitle>Everyone on this trip</SectionTitle>
      {nets.isLoading ? <ListSkeleton rows={2} /> : (
        <Card className="divide-y divide-slate-100 p-0">
          {(nets.data ?? []).length === 0 && <p className="p-4 text-sm text-slate-500">Nobody owes anybody on this trip.</p>}
          {(nets.data ?? []).map((n) => (
            <div key={n.user_id} className="flex items-center justify-between px-4 py-2.5 text-[15px]">
              <span className="inline-flex items-center gap-1.5">
                {v.name(n.user_id, { you: true })}{v.leaderIds.has(n.user_id) && <LeaderBadge />}
              </span>
              <span className="text-right">
                <Balance poisha={n.net_poisha} />
                <span className="ml-1 text-xs text-slate-500">{n.net_poisha > 0 ? 'is owed' : 'owes'}</span>
              </span>
            </div>
          ))}
        </Card>
      )}

      <SectionTitle>Entries</SectionTitle>
      {v.expenses.isLoading ? <ListSkeleton /> : (v.expenses.data?.length ?? 0) === 0 ? (
        <Card className="text-center text-sm text-slate-500">Nothing recorded yet.</Card>
      ) : (
        <div className="space-y-2">
          {v.expenses.data!.map((e) => (
            <ExpenseRow key={e.id} expense={e} groupId={trip.group_id} me={v.me} name={(id) => v.name(id, { you: true })}
                        attribution={attribution.data?.get(e.id)} />
          ))}
        </div>
      )}

      {v.isLeader && (
        <RecordPaymentSheet open={recording} onClose={() => setRecording(false)} tripId={tripId}
                            people={v.roster} onDone={() => void qc.invalidateQueries()} />
      )}
    </AppShell>
  );
}

function EntryModeToggle({ tripId, mode }: { tripId: string; mode: EntryMode }) {
  const qc = useQueryClient();
  const toast = useToast();
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Who can add expenses</p>
      <Segmented label="Entry mode" value={mode} onChange={async (m) => {
        try { await rpc.setEntryMode(tripId, m); void qc.invalidateQueries({ queryKey: ['trip', tripId] }); }
        catch (e) { toast(errorMessage(e), 'error'); }
      }} options={[{ value: 'leaders_only', label: 'Leaders only' }, { value: 'open', label: 'Anyone on the trip' }]} />
    </div>
  );
}

/** Story D-08 — leader records a repayment, bounded by what this trip created. */
function RecordPaymentSheet({ open, onClose, tripId, people, onDone }: {
  open: boolean; onClose: () => void; tripId: string; people: { id: string; name: string }[]; onDone: () => void;
}) {
  const toast = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const poisha = parseTakaToPoisha(amount);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? '?';
  return (
    <Sheet open={open} onClose={onClose} title="Record a payment">
      <div className="space-y-4">
        <Field label="Who paid?">
          <div className="flex flex-wrap gap-2">{people.map((p) => <Chip key={p.id} selected={from === p.id} onClick={() => setFrom(p.id)}>{p.name}</Chip>)}</div>
        </Field>
        <Field label="Who received it?">
          <div className="flex flex-wrap gap-2">{people.map((p) => <Chip key={p.id} disabled={p.id === from} selected={to === p.id} onClick={() => setTo(p.id)}>{p.name}</Chip>)}</div>
        </Field>
        <Field label="Amount (৳)" htmlFor="pay-amount" hint="Only up to what this trip created between them.">
          <Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => isPartialTakaInput(e.target.value) && setAmount(e.target.value)} />
        </Field>
        <Button block busy={busy} disabled={!from || !to || from === to || !poisha} onClick={async () => {
          setBusy(true);
          try {
            await rpc.leaderRecordSettlement({ tripId, debtor: from, creditor: to, amount: poisha! });
            toast(`Recorded: ${nameOf(from)} paid ${nameOf(to)} ${formatTaka(poisha!)}. Both will see it on their dashboard.`);
            onDone(); onClose(); setAmount('');
          } catch (e) { toast(errorMessage(e), 'error'); }
          finally { setBusy(false); }
        }}>Record</Button>
      </div>
    </Sheet>
  );
}
