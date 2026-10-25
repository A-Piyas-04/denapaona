import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell, SectionTitle } from '@/components/AppShell';
import { LeaderBadge, LeaderExplainer } from '@/components/LeaderBadge';
import { Button, Card, Chip, Sheet } from '@/components/ui';
import { ErrorState, ListSkeleton } from '@/components/States';
import { useToast } from '@/components/Toast';
import { useTripView } from '@/hooks/useTripView';
import { rpc } from '@/lib/rpc';
import { errorMessage } from '@/lib/errors';
import { dateTime } from '@/lib/format';

/**
 * Leader management (stories D-05, D-06, D-12).  The appointment log is
 * visible to every member.  Appointing is the privilege-escalation surface, so
 * it is only ever done through add_trip_leader(), which checks auth.uid().
 */
export function TripLeaders() {
  const { id: tripId = '' } = useParams();
  const v = useTripView(tripId);
  const qc = useQueryClient();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  if (v.trip.isLoading) return <AppShell title="Leaders" back><ListSkeleton /></AppShell>;
  if (!v.trip.data) return <AppShell title="Leaders" back><ErrorState error={v.trip.error} /></AppShell>;
  const { leaders, log, trip } = v.trip.data;
  const candidates = [...v.roster, ...v.others].filter((p) => !v.leaderIds.has(p.id));

  async function run(key: string, fn: () => Promise<void>, ok: string) {
    setBusy(key);
    try { await fn(); toast(ok); void qc.invalidateQueries({ queryKey: ['trip', tripId] }); }
    catch (e) { toast(errorMessage(e), 'error'); }
    finally { setBusy(null); }
  }

  return (
    <AppShell title="Trip leaders" back={`/trips/${tripId}`}>
      <div className="mb-3"><LeaderExplainer /></div>
      <Card className="divide-y divide-slate-100 p-0">
        {leaders.map((l) => (
          <div key={l.user_id} className="flex items-center justify-between px-4 py-3">
            <span className="inline-flex items-center gap-2 text-[15px]">{v.name(l.user_id, { you: true })} <LeaderBadge /></span>
            {v.isLeader && (
              <Button size="sm" variant="ghost" busy={busy === l.user_id} disabled={leaders.length <= 1}
                      title={leaders.length <= 1 ? 'A trip needs at least one leader.' : undefined}
                      onClick={() => run(l.user_id, () => rpc.removeTripLeader(tripId, l.user_id), `${v.name(l.user_id)} is no longer a leader`)}>
                Remove
              </Button>
            )}
          </div>
        ))}
      </Card>
      {leaders.length <= 1 && <p className="mt-2 text-xs text-slate-500">A trip needs at least one leader.</p>}
      {v.isLeader && <Button className="mt-3" variant="outline" block onClick={() => setAdding(true)}>Add a leader</Button>}
      {trip.status === 'closed' && <p className="mt-3 text-sm text-slate-600">This trip is closed, so nobody has leader powers now.</p>}

      <SectionTitle>Log</SectionTitle>
      <Card className="divide-y divide-slate-100 p-0">
        {log.map((l) => (
          <p key={l.id} className="px-4 py-2.5 text-sm text-slate-700">
            {{
              appointed: `${v.name(l.actor_id, { you: true })} made ${v.name(l.user_id, { you: true })} a leader`,
              removed: `${v.name(l.actor_id, { you: true })} removed ${v.name(l.user_id, { you: true })} as leader`,
              trip_closed: `${v.name(l.actor_id, { you: true })} closed the trip`,
              trip_reopened: `${v.name(l.actor_id, { you: true })} reopened the trip`,
            }[l.action]}
            <span className="block text-xs text-slate-500">{dateTime(l.created_at)}</span>
          </p>
        ))}
      </Card>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add a leader">
        <p className="mb-3 text-sm text-slate-600">They’ll be able to add, cancel and settle anything on this trip without approval — but never transfer anyone’s debt.</p>
        <div className="flex flex-wrap gap-2">
          {candidates.map((p) => (
            <Chip key={p.id} onClick={() => { setAdding(false); void run(p.id, () => rpc.addTripLeader(tripId, p.id), `${p.name} is now a leader`); }}>
              {p.name}
            </Chip>
          ))}
        </div>
      </Sheet>
    </AppShell>
  );
}
