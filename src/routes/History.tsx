import { useParams } from 'react-router-dom';
import { Ban, History as HistoryIcon, Star } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ExpenseRow } from '@/components/ExpenseRow';
import { PROPOSAL_TYPE } from '@/components/ProposalCard';
import { Badge, Button, Chip, IconTile, ListGroup, ListRow, Section, useTabParam } from '@/components/ui';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/States';
import { Taka } from '@/components/Money';
import { useMe } from '@/hooks/useAuth';
import { useNames } from '@/hooks/useGroups';
import { useAttribution, useHistory, type HistoryItem } from '@/hooks/useGroupLedger';
import { useRealtimeGroup } from '@/hooks/useRealtimeProposals';
import { proposalOutcome } from '@/lib/errors';
import { describeProposal } from '@/lib/describe';
import type { Attribution } from '@/lib/rpc';

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

const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** Story B-05 — the full immutable history.  Nothing is ever hidden. */
export function History() {
  const { id: groupId = '' } = useParams();
  const me = useMe();
  useRealtimeGroup(groupId);
  const history = useHistory(groupId);
  const attribution = useAttribution(groupId);
  const { name } = useNames(groupId);
  const [filter, setFilter] = useTabParam<Filter>('filter', 'all', FILTERS);
  const nm = (id: string | null | undefined) => name(id, { you: true });
  const all = history.data?.pages.flatMap((p) => p.items) ?? [];
  const items = all.filter((i) => filter === 'all' || (filter === 'expenses' ? i.kind === 'expense' || i.kind === 'void' : i.kind === 'proposal' || i.kind === 'leader'));

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
      {history.isLoading ? <ListSkeleton rows={5} />
        : history.error ? <ErrorState error={history.error} onRetry={() => history.refetch()} />
        : items.length === 0 ? <EmptyState icon={HistoryIcon} title="Nothing here yet" body="Every expense, agreement and correction stays here for good." />
        : (
          <>
            {days.map((day) => (
              <Section key={day.label} title={day.label}>
                <ListGroup>
                  {day.items.map((item) => <Item key={item.id} item={item} groupId={groupId} me={me} nm={nm}
                                                 plain={(id) => name(id)} attribution={attribution.data} />)}
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

function Item({ item, groupId, me, nm, plain, attribution }: {
  item: HistoryItem; groupId: string; me: string; nm: (id: string | null | undefined) => string;
  plain: (id: string) => string; attribution?: Map<string, Attribution>;
}) {
  if (item.kind === 'expense') {
    return <ExpenseRow expense={item.expense} groupId={groupId} me={me} name={nm} attribution={attribution?.get(item.expense.id)} dateTile={false} />;
  }
  if (item.kind === 'void') {
    const e = item.expense;
    const a = attribution?.get(e.id);
    return (
      <ListRow wrap to={`/groups/${groupId}/expenses/${e.id}`}
               leading={<IconTile><Ban size={20} /></IconTile>}
               title={<>Cancelled “{e.description}”</>}
               subtitle={`${a?.voided_by_agreement ? 'By agreement' : `By ${nm(e.voided_by)}${a?.voided_by_leader ? ' (trip leader)' : ''}`}: ${e.void_reason}`}
               trailing={<Taka poisha={e.total_poisha} className="text-[15px] text-slate-400 line-through" />} />
    );
  }
  if (item.kind === 'leader') {
    const l = item.log;
    const text = {
      appointed: `${nm(l.actor_id)} made ${nm(l.user_id)} a trip leader`,
      removed: `${nm(l.actor_id)} removed ${nm(l.user_id)} as trip leader`,
      trip_closed: `${nm(l.actor_id)} closed a trip`,
      trip_reopened: `${nm(l.actor_id)} reopened a trip`,
    }[l.action];
    return (
      <ListRow wrap to={`/trips/${l.trip_id}/leaders`} leading={<IconTile tone="amber"><Star size={20} /></IconTile>}
               title={text} subtitle={time(item.at)} />
    );
  }
  const p = item.proposal;
  const type = PROPOSAL_TYPE[p.type];
  const Icon = type.icon;
  const tone = p.status === 'approved' ? 'owed' : p.status === 'pending' ? 'amber' : 'slate';
  const leader = p.status === 'approved' && (p.payload as { leader_recorded?: boolean }).leader_recorded;
  return (
    <ListRow wrap to={`/proposals/${p.id}`}
             leading={<IconTile tone="brand"><Icon size={20} /></IconTile>}
             title={describeProposal(p, plain)}
             subtitle={leader ? `Recorded by ${nm(p.proposer_id)} (trip leader)` : proposalOutcome(p.status, p.type)}
             trailing={<Badge tone={tone}>{p.status === 'approved' ? 'Done' : p.status === 'pending' ? 'Pending' : p.status === 'rejected' ? 'Declined' : p.status === 'cancelled' ? 'Withdrawn' : p.status === 'expired' ? 'Expired' : 'Not possible'}</Badge>} />
  );
}
