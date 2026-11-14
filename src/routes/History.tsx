import { useParams } from 'react-router-dom';
import { Ban, History as HistoryIcon } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ExpenseRow } from '@/components/ExpenseRow';
import { PROPOSAL_TYPE } from '@/components/ProposalCard';
import { Badge, Button, Chip, IconTile, ListGroup, ListRow, Section, useTabParam } from '@/components/ui';
import { EmptyState, ErrorState, ScreenSkeleton } from '@/components/States';
import { Taka } from '@/components/Money';
import { useMe } from '@/hooks/useAuth';
import { useNames } from '@/hooks/useGroups';
import { useHistory, type HistoryItem } from '@/hooks/useGroupLedger';
import { useRealtimeGroup } from '@/hooks/useRealtimeProposals';
import { proposalOutcome } from '@/lib/errors';
import { describeProposal } from '@/lib/describe';

const FILTERS = ['all', 'expenses', 'agreements'] as const;
type Filter = (typeof FILTERS)[number];

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

/** Story B-05 — the full immutable history.  Nothing is ever hidden. */
export function History() {
  const { id: groupId = '' } = useParams();
  const me = useMe();
  useRealtimeGroup(groupId);
  const history = useHistory(groupId);
  const { name } = useNames(groupId);
  const [filter, setFilter] = useTabParam<Filter>('filter', 'all', FILTERS);
  const nm = (id: string | null | undefined) => name(id, { you: true });
  const all = history.data?.pages.flatMap((p) => p.items) ?? [];
  const items = all.filter((i) => filter === 'all' || (filter === 'expenses' ? i.kind === 'expense' || i.kind === 'void' : i.kind === 'proposal'));

  const days: { label: string; items: HistoryItem[] }[] = [];
  for (const item of items) {
    const label = dayLabel(item.at);
    const last = days[days.length - 1];
    if (last?.label === label) last.items.push(item); else days.push({ label, items: [item] });
  }

  return (
    <AppShell title="History" back={`/groups/${groupId}`}>
      <div className="-mb-2 flex gap-2 overflow-x-auto scrollbar-none" role="group" aria-label="Filter history">
        {([['all', 'All'], ['expenses', 'Expenses'], ['agreements', 'Agreements']] as const).map(([id, label]) => (
          <Chip key={id} selected={filter === id} onClick={() => setFilter(id)}>{label}</Chip>
        ))}
      </div>
      {history.isLoading ? <ScreenSkeleton variant="list" />
        : history.error ? <ErrorState error={history.error} onRetry={() => history.refetch()} />
        : items.length === 0 ? <EmptyState icon={HistoryIcon} title="Nothing here yet" body="Every expense, agreement and correction stays here for good." />
        : (
          <>
            {days.map((day) => (
              <Section key={day.label} title={day.label}>
                <ListGroup>
                  {day.items.map((item) => <Item key={item.id} item={item} groupId={groupId} me={me} nm={nm}
                                                 plain={(id) => name(id)} />)}
                </ListGroup>
              </Section>
            ))}
            {history.hasNextPage ? (
              <Button variant="outline" block busy={history.isFetchingNextPage} onClick={() => history.fetchNextPage()}>
                Load older
              </Button>
            ) : <p className="py-2 text-center text-[13px] text-slate-400">That’s everything, back to the start.</p>}
          </>
        )}
    </AppShell>
  );
}

function Item({ item, groupId, me, nm, plain }: {
  item: HistoryItem; groupId: string; me: string; nm: (id: string | null | undefined) => string;
  plain: (id: string) => string;
}) {
  if (item.kind === 'expense') {
    return <ExpenseRow expense={item.expense} groupId={groupId} me={me} name={nm} dateTile={false} />;
  }
  if (item.kind === 'void') {
    const e = item.expense;
    return (
      <ListRow wrap to={`/groups/${groupId}/expenses/${e.id}`}
               leading={<IconTile><Ban size={20} /></IconTile>}
               title={<>Cancelled “{e.description}”</>}
               subtitle={`By agreement: ${e.void_reason}`}
               trailing={<Taka poisha={e.total_poisha} className="text-[15px] text-slate-400 line-through" />} />
    );
  }
  const p = item.proposal;
  const type = PROPOSAL_TYPE[p.type];
  const Icon = type.icon;
  const tone = p.status === 'approved' ? 'owed' : p.status === 'pending' ? 'amber' : 'slate';
  return (
    <ListRow wrap to={`/proposals/${p.id}`}
             leading={<IconTile tone="brand"><Icon size={20} /></IconTile>}
             title={describeProposal(p, plain)}
             subtitle={proposalOutcome(p.status, p.type)}
             trailing={<Badge tone={tone}>{p.status === 'approved' ? 'Done' : p.status === 'pending' ? 'Pending' : p.status === 'rejected' ? 'Declined' : p.status === 'cancelled' ? 'Withdrawn' : p.status === 'expired' ? 'Expired' : 'Not possible'}</Badge>} />
  );
}
