import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Lock, UserPlus } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { LeaderBadge, LeaderExplainer } from '@/components/LeaderBadge';
import { Avatar, Banner, Button, ListGroup, ListRow, Sheet, Tabs, useTabParam } from '@/components/ui';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/States';
import { useToast } from '@/components/Toast';
import { useTripView } from '@/hooks/useTripView';
import { rpc } from '@/lib/rpc';
import { errorMessage } from '@/lib/errors';
import { dateTime } from '@/lib/format';

const TABS = ['leaders', 'log'] as const;

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
  const [tab, setTab] = useTabParam('tab', 'leaders', TABS);

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
    <AppShell title="Trip leaders" back={`/trips/${tripId}`} action={<LeaderExplainer />}>
      {trip.status === 'closed' && <Banner icon={Lock}>Trip closed. Nobody has leader powers now.</Banner>}

      <div>
        <Tabs label="Leader sections" value={tab} onChange={setTab} className="mb-4" items={[
          { id: 'leaders', label: 'Leaders', count: leaders.length },
          { id: 'log', label: 'History' },
        ]} />

        {tab === 'leaders' ? (
          <div className="space-y-3">
            <ListGroup>
              {leaders.map((l) => (
                <ListRow key={l.user_id}
                         leading={<Avatar name={v.name(l.user_id)} seed={l.user_id} />}
                         title={<span className="inline-flex items-center gap-1.5">{v.name(l.user_id, { you: true })} <LeaderBadge /></span>}
                         trailing={v.isLeader ? (
                           <Button size="sm" variant="ghost" busy={busy === l.user_id} disabled={leaders.length <= 1}
                                   title={leaders.length <= 1 ? 'A trip needs at least one leader.' : undefined}
                                   onClick={() => run(l.user_id, () => rpc.removeTripLeader(tripId, l.user_id), `${v.name(l.user_id)} is no longer a leader`)}>
                             Remove
                           </Button>
                         ) : undefined} />
              ))}
            </ListGroup>
            {leaders.length <= 1 && <p className="px-1 text-[13px] text-slate-500">A trip needs at least one leader.</p>}
            {v.isLeader && <Button block size="lg" onClick={() => setAdding(true)}><UserPlus size={18} aria-hidden /> Add a leader</Button>}
          </div>
        ) : log.length === 0 ? (
          <EmptyState title="No changes yet" />
        ) : (
          <ListGroup>
            {log.map((l) => (
              <ListRow key={l.id}
                       title={{
                         appointed: `${v.name(l.actor_id, { you: true })} made ${v.name(l.user_id, { you: true })} a leader`,
                         removed: `${v.name(l.actor_id, { you: true })} removed ${v.name(l.user_id, { you: true })}`,
                         trip_closed: `${v.name(l.actor_id, { you: true })} closed the trip`,
                         trip_reopened: `${v.name(l.actor_id, { you: true })} reopened the trip`,
                       }[l.action]}
                       subtitle={dateTime(l.created_at)} />
            ))}
          </ListGroup>
        )}
      </div>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add a leader">
        <p className="mb-4 text-[15px] text-slate-600">They can add, cancel and settle on this trip without approval. Never move anyone’s debt.</p>
        {candidates.length === 0 ? <p className="text-[15px] text-slate-500">Everyone on the trip is already a leader.</p> : (
          <ListGroup>
            {candidates.map((p) => (
              <ListRow key={p.id} onClick={() => { setAdding(false); void run(p.id, () => rpc.addTripLeader(tripId, p.id), `${p.name} is now a leader`); }}
                       leading={<Avatar name={p.name} seed={p.id} />} title={p.name} chevron />
            ))}
          </ListGroup>
        )}
      </Sheet>
    </AppShell>
  );
}
