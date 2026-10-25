import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { ExpenseForm } from '@/components/ExpenseForm';
import { ErrorState, ListSkeleton } from '@/components/States';
import { useTripView } from '@/hooks/useTripView';
import { useExpense } from '@/hooks/useGroupLedger';

/**
 * Fast trip entry (story D-02, Feature 4.4).  Non-leaders on a leaders-only
 * trip see who to ask instead of a form that would error on save (§13.3).
 */
export function TripAdd() {
  const { id: tripId = '' } = useParams();
  const [params] = useSearchParams();
  const fromId = params.get('from');
  const navigate = useNavigate();
  const v = useTripView(tripId);
  const prefill = useExpense(fromId ?? '');

  if (v.trip.isLoading || v.members.isLoading || (fromId && prefill.isLoading)) {
    return <AppShell title="Add expense" back={`/trips/${tripId}`}><ListSkeleton /></AppShell>;
  }
  if (v.trip.error || !v.trip.data) return <AppShell title="Add expense" back><ErrorState error={v.trip.error} /></AppShell>;
  const { trip, leaders } = v.trip.data;

  if (trip.status !== 'active') {
    return (
      <AppShell title="Add expense" back={`/trips/${tripId}`}>
        <ErrorState error={new Error('TRIP_CLOSED')} />
      </AppShell>
    );
  }
  if (trip.entry_mode === 'leaders_only' && !v.isLeader) {
    return (
      <AppShell title="Add expense" back={`/trips/${tripId}`}>
        <p className="rounded-2xl bg-amber-50 p-4 text-[15px] text-amber-900 ring-1 ring-amber-200">
          On this trip only the leaders record expenses. Ask {leaders.map((l) => v.name(l.user_id)).join(' or ')}.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell title={fromId ? 'Re-enter the corrected expense' : trip.name} back={`/trips/${tripId}`}>
      <ExpenseForm
        groupId={trip.group_id}
        me={v.me}
        tripId={tripId}
        roster={v.roster}
        others={v.others}
        presets={v.trip.data.presets}
        recentSets={v.recentSets}
        runningTotal={v.runningTotal}
        prefill={fromId ? prefill.data : null}
        onSaved={() => navigate(`/trips/${tripId}`, { replace: true })}
      />
    </AppShell>
  );
}
