import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell, SectionTitle } from '@/components/AppShell';
import { SettleSuggestions } from '@/components/SettleSuggestions';
import { Button, Card, Sheet } from '@/components/ui';
import { ErrorState, ListSkeleton } from '@/components/States';
import { Balance } from '@/components/Money';
import { useToast } from '@/components/Toast';
import { useTripView } from '@/hooks/useTripView';
import { useTripNets } from '@/hooks/useTrips';
import { rpc } from '@/lib/rpc';
import { errorMessage } from '@/lib/errors';

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
      <p className="mb-3 text-sm text-slate-600">
        Calculated <strong>from this trip only</strong> — older debts between the same people aren’t included.
      </p>

      <SectionTitle>Where everyone stands</SectionTitle>
      {nets.isLoading ? <ListSkeleton rows={2} /> : (
        <Card className="divide-y divide-slate-100 p-0">
          {(nets.data ?? []).length === 0 && <p className="p-4 text-sm text-slate-500">Everyone’s square on this trip.</p>}
          {(nets.data ?? []).map((n) => (
            <div key={n.user_id} className="flex justify-between px-4 py-2.5 text-[15px]">
              <span>{v.name(n.user_id, { you: true })}</span>
              <span><Balance poisha={n.net_poisha} /> <span className="text-xs text-slate-500">{n.net_poisha > 0 ? 'to get back' : 'to pay'}</span></span>
            </div>
          ))}
        </Card>
      )}

      <SectionTitle>Suggested payments</SectionTitle>
      {nets.data && (
        <SettleSuggestions groupId={trip.group_id} me={v.me} tripId={tripId} leaderMode={v.isLeader}
                           name={(id) => v.name(id)}
                           nets={new Map(nets.data.map((n) => [n.user_id, n.net_poisha]))} />
      )}

      {active && (
        <div className="mt-8">
          <Button block size="lg" variant="danger" onClick={() => setConfirm(true)}>Close trip</Button>
          <p className="mt-2 text-center text-xs text-slate-500">You can close with amounts still outstanding.</p>
        </div>
      )}

      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Close this trip?">
        <ul className="list-disc space-y-1 pl-5 text-[15px] text-slate-700">
          <li>Nobody can add expenses to it any more.</li>
          <li>Leaders lose their special powers — corrections will need both people to agree.</li>
          <li>Anything still owed stays owed, as an ordinary group debt.</li>
          <li>A former leader can reopen it; everyone will see that they did.</li>
        </ul>
        <div className="mt-5 grid grid-cols-2 gap-2">
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
      </Sheet>
    </AppShell>
  );
}
