import { useParams } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { HistoryView } from '@/components/tour/HistoryView';
import { Loadable, ScreenSkeleton } from '@/components/States';
import { useTourHistory } from '@/hooks/useTours';

export function TourHistory() {
  const { tourId = '' } = useParams();
  const history = useTourHistory(tourId);

  return (
    <AppShell title={history.data?.tourName ?? 'History'} back={`/tours/${tourId}`}>
      <Loadable query={history} skeleton={<ScreenSkeleton variant="list" />}>
        {(data) => <HistoryView events={data.events} />}
      </Loadable>
    </AppShell>
  );
}
