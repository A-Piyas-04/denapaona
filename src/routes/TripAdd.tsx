import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ExpenseForm } from '@/components/ExpenseForm';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/States';
import { ButtonLink } from '@/components/ui';
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
    return <AppShell title="New expense" back={`/trips/${tripId}`} nav={false}><ListSkeleton /></AppShell>;
  }
  if (v.trip.error || !v.trip.data) return <AppShell title="New expense" back nav={false}><ErrorState error={v.trip.error} /></AppShell>;
  const { trip, leaders } = v.trip.data;

  if (trip.status !== 'active') {
    return (
      <AppShell title="New expense" back={`/trips/${tripId}`} nav={false}>
        <ErrorState error={new Error('TRIP_CLOSED')} />
      </AppShell>
    );
  }
  if (trip.entry_mode === 'leaders_only' && !v.isLeader) {
    return (
      <AppShell title="New expense" back={`/trips/${tripId}`} nav={false}>
        <EmptyState icon={Users} title="Only leaders add expenses on this trip"
                    body={`Ask ${leaders.map((l) => v.name(l.user_id)).join(' or ')}.`}>
          <ButtonLink to={`/trips/${tripId}`} variant="secondary" block>Back to trip</ButtonLink>
        </EmptyState>
      </AppShell>
    );
  }

  return (
    <AppShell title={fromId ? 'Re-enter the expense' : `New expense, ${trip.name}`} back={`/trips/${tripId}`} nav={false}>
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
