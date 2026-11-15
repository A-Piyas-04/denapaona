import { MapPinned } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { CreateJoinTour } from '@/components/tour/CreateJoinTour';
import { Avatar, ListGroup, ListRow, Section } from '@/components/ui';
import { EmptyState, Loadable, ScreenSkeleton } from '@/components/States';
import { useMyTours } from '@/hooks/useTours';
import { useT } from '@/lib/i18n';

export function ToursHome() {
  const tours = useMyTours();
  const t = useT();

  return (
    <AppShell title={t('tours.title')}>
      <div className="space-y-6">
        <CreateJoinTour />
        <Loadable query={tours} skeleton={<ScreenSkeleton variant="list" />}>
          {(list) =>
            list.length === 0 ? (
              <EmptyState
                icon={MapPinned}
                title={t('tours.empty.title')}
                body={t('tours.empty.body')}
              />
            ) : (
              <Section title={t('tours.yours')}>
                <ListGroup>
                  {list.map((tour) => (
                    <ListRow
                      key={tour.id}
                      to={`/tours/${tour.id}`}
                      leading={<Avatar name={tour.name} seed={tour.id} size={44} square />}
                      title={tour.name}
                      subtitle={
                        tour.role === 'owner'
                          ? 'Owner'
                          : tour.role === 'leader'
                            ? 'Leader'
                            : 'Member'
                      }
                    />
                  ))}
                </ListGroup>
              </Section>
            )
          }
        </Loadable>
      </div>
    </AppShell>
  );
}
