import { useParams } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { ExpenseForm } from '@/components/tour/ExpenseForm';
import { LeaderControls } from '@/components/tour/LeaderControls';
import { RecentExpenses } from '@/components/tour/RecentExpenses';
import { Loadable, ScreenSkeleton } from '@/components/States';
import { useTourManage } from '@/hooks/useTours';

export function TourManage() {
  const { tourId = '' } = useParams();
  const manage = useTourManage(tourId);

  return (
    <AppShell title={manage.data?.tourName ?? 'Manage'} back={`/tours/${tourId}`}>
      <Loadable query={manage} skeleton={<ScreenSkeleton variant="form" />}>
        {(data) => (
          <div className="space-y-6">
            <div className="rounded-2xl border border-night-line/70 bg-paper p-4 shadow-soft">
              <p className="text-xs font-medium text-ink-soft">Join PIN</p>
              <p className="mt-1 font-display text-2xl tracking-[0.25em] text-ink">{data.joinCode}</p>
              <p className="mt-1 text-xs text-ink-soft">Share this PIN so friends can join.</p>
            </div>
            <ExpenseForm tourId={tourId} members={data.members} />
            <RecentExpenses tourId={tourId} expenses={data.expenses} />
            {data.isOwner && <LeaderControls tourId={tourId} members={data.members} />}
          </div>
        )}
      </Loadable>
    </AppShell>
  );
}
