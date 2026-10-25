import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Lock, RotateCcw, ShieldOff, Wallet } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { SettleSuggestions } from '@/components/SettleSuggestions';
import { Avatar, Button, ListGroup, ListRow, Section, Sheet } from '@/components/ui';
import { ErrorState, ListSkeleton } from '@/components/States';
import { Balance } from '@/components/Money';
import { useToast } from '@/components/Toast';
import { useTripView } from '@/hooks/useTripView';
import { useTripNets } from '@/hooks/useTrips';
import { rpc } from '@/lib/rpc';
import { errorMessage } from '@/lib/errors';

const CLOSING = [
  { icon: Lock, text: 'Nobody can add expenses to it.' },
  { icon: ShieldOff, text: 'Leaders lose their special powers.' },
  { icon: Wallet, text: 'Anything still owed stays owed, as a group debt.' },
  { icon: RotateCcw, text: 'A former leader can reopen it. Everyone sees that.' },
];

/**
 * Trip-scoped settlement and closing (stories D-10, F-03, Feature 4.6).
 * Closing never demands settlement and never freezes the ledger: outstanding
 * amounts simply become ordinary group debts, and leader authority ends.
 */
export function TripClose() {
  const { id: tripId = '' } = useParams();
  const v = useTripView(tripId);
  const nets = useTripNets(tripId);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  if (v.trip.isLoading) return <AppShell title="Settle trip" back><ListSkeleton /></AppShell>;
  if (!v.trip.data) return <AppShell title="Settle trip" back><ErrorState error={v.trip.error} /></AppShell>;
  const { trip } = v.trip.data;
  const active = trip.status === 'active';

  return (
    <AppShell title={`Settle ${trip.name}`} back={`/trips/${tripId}`}>
      <p className="-mb-2 px-1 text-[14px] text-slate-500">From this trip only. Older debts aren’t included.</p>

      <Section title="Where everyone stands">
        {nets.isLoading ? <ListSkeleton rows={2} /> : (nets.data ?? []).length === 0 ? (
          <p className="rounded-2xl bg-white px-4 py-4 text-[15px] text-slate-500">Everyone’s square on this trip.</p>
        ) : (
          <ListGroup>
            {(nets.data ?? []).map((n) => (
              <ListRow key={n.user_id} leading={<Avatar name={v.name(n.user_id)} seed={n.user_id} />}
                       title={v.name(n.user_id, { you: true })}
                       subtitle={n.net_poisha > 0 ? 'To get back' : 'To pay'}
                       trailing={<Balance poisha={n.net_poisha} className="text-[15px]" />} />
            ))}
          </ListGroup>
        )}
      </Section>

      <Section title="Suggested payments">
        {nets.data && (
          <div className="flex flex-col gap-6">
            <SettleSuggestions groupId={trip.group_id} me={v.me} tripId={tripId} leaderMode={v.isLeader}
                               name={(id) => v.name(id)}
                               nets={new Map(nets.data.map((n) => [n.user_id, n.net_poisha]))} />
          </div>
        )}
      </Section>

      {active && (
        <div className="space-y-2 pt-2">
          <Button block size="lg" variant="outline" className="border-owe/40 text-owe hover:bg-owe-soft" onClick={() => setConfirm(true)}>
            <Lock size={18} aria-hidden /> Close trip
          </Button>
          <p className="text-center text-[13px] text-slate-500">You can close with amounts still owed.</p>
        </div>
      )}

      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Close this trip?"
             footer={
               <div className="grid grid-cols-2 gap-2">
                 <Button variant="secondary" onClick={() => setConfirm(false)}>Not yet</Button>
                 <Button variant="danger" busy={busy} onClick={async () => {
                   setBusy(true);
                   try {
                     await rpc.closeTrip(tripId);
                     toast('Trip closed');
                     void qc.invalidateQueries();
                     navigate(`/trips/${tripId}`, { replace: true });
                   } catch (e) { toast(errorMessage(e), 'error'); }
                   finally { setBusy(false); setConfirm(false); }
                 }}>Close trip</Button>
               </div>
             }>
        <ul className="space-y-3">
          {CLOSING.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-[15px] text-slate-700">
              <Icon size={19} className="mt-0.5 shrink-0 text-slate-400" aria-hidden />{text}
            </li>
          ))}
        </ul>
      </Sheet>
    </AppShell>
  );
}
