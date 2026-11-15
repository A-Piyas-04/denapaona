import { Link, useParams } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { BalanceLists } from '@/components/tour/BalanceLists';
import { ButtonLink } from '@/components/ui';
import { Loadable, ScreenSkeleton } from '@/components/States';
import { useTourBalances } from '@/hooks/useTours';

export function TourBalances() {
  const { tourId = '' } = useParams();
  const balances = useTourBalances(tourId);
  const isLeader =
    balances.data?.role === 'owner' || balances.data?.role === 'leader';

  return (
    <AppShell
      title={balances.data?.tourName ?? 'Tour'}
      back="/tours"
      action={
        <div className="flex items-center gap-1">
          <ButtonLink to={`/tours/${tourId}/history`} variant="ghost" size="sm">
            History
          </ButtonLink>
          {isLeader && (
            <ButtonLink to={`/tours/${tourId}/manage`} variant="ghost" size="sm">
              Manage
            </ButtonLink>
          )}
        </div>
      }
    >
      <Loadable query={balances} skeleton={<ScreenSkeleton variant="dashboard" />}>
        {(data) => (
          <div className="space-y-4">
            <p className="text-sm text-ink-soft">
              Viewing as <span className="font-semibold text-ink">{data.userName}</span>
            </p>
            <BalanceLists tourId={tourId} data={data} />
            {isLeader && (
              <Link
                to={`/tours/${tourId}/manage`}
                className="pressable block rounded-xl bg-brand px-4 py-3 text-center text-sm font-semibold text-brand-fg"
              >
                Manage expenses
              </Link>
            )}
          </div>
        )}
      </Loadable>
    </AppShell>
  );
}
