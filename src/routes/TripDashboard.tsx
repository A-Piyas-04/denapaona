import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { HandCoins, Lock, Plus, RotateCcw, Scale, Star, UserCog, Users, Wallet } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { BalanceBreakdown, BalanceHero } from '@/components/BalanceCard';
import { ExpenseRow } from '@/components/ExpenseRow';
import { LeaderBadge, LeaderExplainer } from '@/components/LeaderBadge';
import {
  Avatar, Badge, Banner, Button, Chip, Fab, Field, Input, ListGroup, ListRow, MoreMenu, Segmented, Sheet, Tabs, useTabParam,
} from '@/components/ui';
import { EmptyState, ErrorState, HeroSkeleton, ListSkeleton } from '@/components/States';
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

const TABS = ['entries', 'balances', 'people'] as const;

/** Trip dashboard — stories D-09, D-12, D-08, E-04. */
export function TripDashboard() {
  const { id: tripId = '' } = useParams();
  const v = useTripView(tripId);
  useRealtimeGroup(v.groupId || undefined);
  const nets = useTripNets(tripId);
  const attribution = useAttribution(v.groupId, tripId);
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useTabParam('tab', 'entries', TABS);
  const [sheet, setSheet] = useState<null | 'record' | 'mode'>(null);

  if (v.trip.isLoading) return <AppShell title="Trip" back><HeroSkeleton /><ListSkeleton /></AppShell>;
  if (v.trip.error || !v.trip.data) return <AppShell title="Trip" back><ErrorState error={v.trip.error} /></AppShell>;
  const { trip, leaders } = v.trip.data;
  const active = trip.status === 'active';
  const canAdd = active && (trip.entry_mode === 'open' || v.isLeader);
  const leaderNames = leaders.map((l) => v.name(l.user_id, { you: true }));
  const wasLeader = leaders.some((l) => l.user_id === v.me);

  async function reopen() {
    try { await rpc.reopenTrip(tripId); toast('Trip reopened. Everyone on it can see you did.'); void qc.invalidateQueries(); }
    catch (e) { toast(errorMessage(e), 'error'); }
  }

  return (
    <AppShell
      title={trip.name}
      back={`/groups/${trip.group_id}/trips`}
      action={
        <MoreMenu title={trip.name} items={[
          { label: active ? 'Settle & close' : 'Settle up', icon: HandCoins, to: `/trips/${tripId}/close` },
          { label: 'Record a payment', icon: Wallet, onClick: () => setSheet('record'), hidden: !v.isLeader },
          { label: 'Who can add expenses', icon: UserCog, onClick: () => setSheet('mode'), hidden: !v.isLeader || !active,
            hint: trip.entry_mode === 'open' ? 'Anyone on the trip' : 'Leaders only' },
          { label: 'Leaders', icon: Star, to: `/trips/${tripId}/leaders` },
          { label: 'Reopen trip', icon: RotateCcw, onClick: reopen, hidden: active || !wasLeader },
          { label: 'Your full group balance', icon: Scale, to: `/groups/${trip.group_id}` },
        ]} />
      }
      fab={canAdd ? <Fab to={`/trips/${tripId}/add`} label="Add expense" icon={Plus} /> : undefined}
    >
      {!active && (
        <Banner icon={Lock} tone="neutral">Trip closed. Changes now need both people to agree.</Banner>
      )}

      <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white">
        <div className="flex items-start justify-between gap-3 px-5 pb-4 pt-5">
          <div>
            <p className="text-[15px] font-medium text-slate-500">Trip so far</p>
            <Taka poisha={v.runningTotal} className="mt-1 block font-display text-[32px] font-semibold leading-tight text-slate-900" />
          </div>
          <Badge tone={active ? 'brand' : 'slate'}>{active ? 'Active' : 'Closed'}</Badge>
        </div>
        <div className="flex items-center border-t border-slate-100 pr-3">
          <Link to={`/trips/${tripId}/leaders`} className="flex min-w-0 flex-1 items-center gap-3 px-5 py-3 hover:bg-slate-50">
            <span className="flex -space-x-2">
              {leaders.slice(0, 3).map((l) => <Avatar key={l.user_id} name={v.name(l.user_id)} seed={l.user_id} size={28} className="ring-2 ring-white" />)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px] text-slate-600">
              <span className="font-semibold text-slate-800">Leaders:</span> {leaderNames.join(', ')}
            </span>
          </Link>
          <LeaderExplainer />
        </div>
      </div>

      <BalanceHero groupId={trip.group_id} tripId={tripId} pairs={v.myEntries.data ? v.pairs : undefined}
                   loading={v.myEntries.isLoading} onShowBreakdown={() => setTab('balances')} scopeLabel="Your trip balance" />

      {active && !canAdd && (
        <Banner icon={Users} tone="pending">Only leaders add expenses on this trip. Ask {leaderNames.join(' or ')}.</Banner>
      )}

      <div>
        <Tabs label="Trip sections" value={tab} onChange={setTab} className="mb-4" items={[
          { id: 'entries', label: 'Entries', count: v.expenses.data?.length },
          { id: 'balances', label: 'Your balances' },
          { id: 'people', label: 'Everyone' },
        ]} />

        {tab === 'entries' && (v.expenses.isLoading ? <ListSkeleton /> : (v.expenses.data?.length ?? 0) === 0 ? (
          <EmptyState icon={Wallet} title="Nothing recorded yet" body={canAdd ? 'Add the first expense of the trip.' : 'Leaders will add expenses here.'} />
        ) : (
          <ListGroup>
            {v.expenses.data!.map((e) => (
              <ExpenseRow key={e.id} expense={e} groupId={trip.group_id} me={v.me} name={(id) => v.name(id, { you: true })}
                          attribution={attribution.data?.get(e.id)} />
            ))}
          </ListGroup>
        ))}

        {tab === 'balances' && (
          <div className="space-y-3">
            <BalanceBreakdown groupId={trip.group_id} tripId={tripId} pairs={v.myEntries.data ? v.pairs : undefined} loading={v.myEntries.isLoading} />
            <p className="px-1 text-[13px] text-slate-500">
              From this trip only. <Link to={`/groups/${trip.group_id}`} className="font-semibold text-brand">See your full group balance</Link>
            </p>
          </div>
        )}

        {tab === 'people' && (nets.isLoading ? <ListSkeleton rows={3} /> : (nets.data ?? []).length === 0 ? (
          <EmptyState icon={Scale} title="Everyone’s square" body="Nobody owes anybody on this trip." />
        ) : (
          <ListGroup>
            {(nets.data ?? []).map((n) => (
              <ListRow key={n.user_id}
                       leading={<Avatar name={v.name(n.user_id)} seed={n.user_id} />}
                       title={<span className="inline-flex items-center gap-1.5">{v.name(n.user_id, { you: true })}{v.leaderIds.has(n.user_id) && <LeaderBadge />}</span>}
                       subtitle={n.net_poisha > 0 ? 'Gets back' : n.net_poisha < 0 ? 'Owes' : 'Square'}
                       trailing={<Balance poisha={n.net_poisha} settledText="Square" className="text-[15px]" />} />
            ))}
          </ListGroup>
        ))}
      </div>

      {v.isLeader && (
        <RecordPaymentSheet open={sheet === 'record'} onClose={() => setSheet(null)} tripId={tripId}
                            people={v.roster} onDone={() => void qc.invalidateQueries()} />
      )}
      {v.isLeader && (
        <EntryModeSheet open={sheet === 'mode'} onClose={() => setSheet(null)} tripId={tripId} mode={trip.entry_mode} />
      )}
    </AppShell>
  );
}

function EntryModeSheet({ open, onClose, tripId, mode }: { open: boolean; onClose: () => void; tripId: string; mode: EntryMode }) {
  const qc = useQueryClient();
  const toast = useToast();
  return (
    <Sheet open={open} onClose={onClose} title="Who can add expenses" footer={<Button block onClick={onClose}>Done</Button>}>
      <Segmented label="Entry mode" value={mode} onChange={async (m) => {
        try { await rpc.setEntryMode(tripId, m); void qc.invalidateQueries({ queryKey: ['trip', tripId] }); toast('Updated'); }
        catch (e) { toast(errorMessage(e), 'error'); }
      }} options={[{ value: 'leaders_only', label: 'Leaders only' }, { value: 'open', label: 'Anyone on the trip' }]} />
      <p className="mt-3 text-[13px] text-slate-500">Leaders can always add. Everyone sees who added what.</p>
    </Sheet>
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
    <Sheet open={open} onClose={onClose} title="Record a payment"
           footer={
             <Button block size="lg" busy={busy} disabled={!from || !to || from === to || !poisha} onClick={async () => {
               setBusy(true);
               try {
                 await rpc.leaderRecordSettlement({ tripId, debtor: from, creditor: to, amount: poisha! });
                 toast(`Payment recorded: ${nameOf(from)} paid ${nameOf(to)} ${formatTaka(poisha!)}`);
                 onDone(); onClose(); setAmount('');
               } catch (e) { toast(errorMessage(e), 'error'); }
               finally { setBusy(false); }
             }}>Record payment</Button>
           }>
      <div className="space-y-5">
        <Field label="Who paid?">
          <div className="flex flex-wrap gap-2">{people.map((p) => <Chip key={p.id} selected={from === p.id} onClick={() => setFrom(p.id)}>{p.name}</Chip>)}</div>
        </Field>
        <Field label="Who received it?">
          <div className="flex flex-wrap gap-2">{people.map((p) => <Chip key={p.id} disabled={p.id === from} selected={to === p.id} onClick={() => setTo(p.id)}>{p.name}</Chip>)}</div>
        </Field>
        <Field label="Amount (৳)" htmlFor="pay-amount" hint="Up to what this trip created between them.">
          <Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => isPartialTakaInput(e.target.value) && setAmount(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}
