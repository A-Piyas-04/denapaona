import { Link, useParams } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { ExpenseRow } from '@/components/ExpenseRow';
import { Badge, Button, Card } from '@/components/ui';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/States';
import { Taka } from '@/components/Money';
import { useMe } from '@/hooks/useAuth';
import { useNames } from '@/hooks/useGroups';
import { useAttribution, useHistory, type HistoryItem } from '@/hooks/useGroupLedger';
import { useRealtimeGroup } from '@/hooks/useRealtimeProposals';
import { dateTime } from '@/lib/format';
import { proposalOutcome } from '@/lib/errors';
import { describeProposal } from '@/lib/describe';

/** Story B-05 — the full immutable history.  Nothing is ever hidden. */
export function History() {
  const { id: groupId = '' } = useParams();
  const me = useMe();
  useRealtimeGroup(groupId);
  const history = useHistory(groupId);
  const attribution = useAttribution(groupId);
  const { name } = useNames(groupId);
  const nm = (id: string | null | undefined) => name(id, { you: true });
  const items = history.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <AppShell title="History" back={`/groups/${groupId}`}>
      {history.isLoading ? <ListSkeleton rows={5} />
        : history.error ? <ErrorState error={history.error} onRetry={() => history.refetch()} />
        : items.length === 0 ? <EmptyState title="Nothing yet" body="Every expense, agreement and correction will appear here, permanently." />
        : (
          <div className="space-y-2">
            {items.map((item) => <Item key={item.id} item={item} groupId={groupId} me={me} nm={nm}
                                       plain={(id) => name(id)} attribution={attribution.data} />)}
            {history.hasNextPage ? (
              <Button variant="outline" block busy={history.isFetchingNextPage} onClick={() => history.fetchNextPage()}>
                Load older
              </Button>
            ) : <p className="py-3 text-center text-xs text-slate-400">That’s everything, back to the start.</p>}
          </div>
        )}
    </AppShell>
  );
}

function Item({ item, groupId, me, nm, plain, attribution }: {
  item: HistoryItem; groupId: string; me: string; nm: (id: string | null | undefined) => string;
  plain: (id: string) => string;
  attribution?: Map<string, import('@/lib/rpc').Attribution>;
}) {
  if (item.kind === 'expense') {
    return <ExpenseRow expense={item.expense} groupId={groupId} me={me} name={nm} attribution={attribution?.get(item.expense.id)} />;
  }
  if (item.kind === 'void') {
    const e = item.expense;
    const a = attribution?.get(e.id);
    return (
      <Card className="bg-slate-50 p-3 text-sm">
        <p className="text-slate-700">
          <strong>{e.description}</strong> (<Taka poisha={e.total_poisha} />) was cancelled{' '}
          {a?.voided_by_agreement ? 'by agreement' : <>by {nm(e.voided_by)}{a?.voided_by_leader && ' (trip leader)'}</>}
        </p>
        <p className="text-slate-500">Reason: “{e.void_reason}” · {dateTime(item.at)}</p>
      </Card>
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
      <Link to={`/trips/${l.trip_id}/leaders`} className="block rounded-2xl bg-white px-3 py-2 text-sm text-slate-600 ring-1 ring-slate-200">
        ★ {text} · {dateTime(item.at)}
      </Link>
    );
  }
  const p = item.proposal;
  const tone = p.status === 'approved' ? 'owed' : p.status === 'pending' ? 'amber' : 'slate';
  return (
    <Link to={`/proposals/${p.id}`} className="block">
      <Card className="p-3 text-sm">
        <div className="flex items-start justify-between gap-2">
          <p className="text-slate-800">{describeProposal(p, plain)}</p>
          <Badge tone={tone}>{p.status === 'approved' ? 'done' : p.status}</Badge>
        </div>
        <p className="mt-1 text-slate-500">
          {p.status === 'approved' && (p.payload as { leader_recorded?: boolean }).leader_recorded
            ? `Recorded by ${nm(p.proposer_id)} (trip leader)`
            : proposalOutcome(p.status, p.type)} · {dateTime(item.at)}
        </p>
      </Card>
    </Link>
  );
}
