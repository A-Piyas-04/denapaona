import { useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AppShell, SectionTitle, TextLink } from '@/components/AppShell';
import { BalanceCard } from '@/components/BalanceCard';
import { ExpenseRow } from '@/components/ExpenseRow';
import { InviteCard } from '@/components/InviteCard';
import { Badge, Button, Card } from '@/components/ui';
import { ErrorState, ListSkeleton } from '@/components/States';
import { Taka } from '@/components/Money';
import { useMe } from '@/hooks/useAuth';
import { useGroup, useMembers, useMyPairwise, useNames } from '@/hooks/useGroups';
import { useAttribution, useExpenses, useRecentEntries } from '@/hooks/useGroupLedger';
import { useGroupPending } from '@/hooks/useProposals';
import { useTrips } from '@/hooks/useTrips';
import { useRealtimeGroup } from '@/hooks/useRealtimeProposals';
import { useLastSeen } from '@/hooks/useBrowser';
import { useT } from '@/lib/i18n';

/** Group dashboard (§13.1) — stories B-04, A-02 step 5, G-02. */
export function GroupDashboard() {
  const { id: groupId = '' } = useParams();
  const me = useMe();
  const t = useT();
  const [params] = useSearchParams();
  useRealtimeGroup(groupId);

  const group = useGroup(groupId);
  const members = useMembers(groupId);
  const { name } = useNames(groupId);
  const pairwise = useMyPairwise(groupId);
  const expenses = useExpenses(groupId);
  const attribution = useAttribution(groupId);
  const pending = useGroupPending(groupId);
  const trips = useTrips(groupId);

  const [lastSeen, markSeen] = useLastSeen(`hn.seen.${groupId}.${me}`);
  const changes = useRecentEntries(groupId, me, lastSeen);
  useEffect(() => () => markSeen(), [markSeen]);

  if (group.error) return <AppShell title="Group" back="/groups"><ErrorState error={group.error} onRetry={() => group.refetch()} /></AppShell>;

  const pairs = pairwise.data?.map((p) => ({ otherId: p.to_user, name: name(p.to_user), poisha: -p.owed_poisha }));
  const waitingOnMe = (pending.data ?? []).filter((p) =>
    p.proposal_participants?.some((pp) => pp.user_id === me && pp.decision === 'pending'));
  const activeTrips = (trips.data ?? []).filter((t) => t.status === 'active');
  const changeNet = (changes.data ?? []).reduce((s, e) => s + (e.to_user === me ? e.amount_poisha : -e.amount_poisha), 0);

  return (
    <AppShell title={group.data?.name ?? ' '} back="/groups" action={
      <Link to={`/groups/${groupId}/settings`} aria-label="Group settings"
            className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
      </Link>
    }>
      {waitingOnMe.length > 0 && (
        <Link to="/proposals" className="mb-3 block rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          {waitingOnMe.length === 1 ? '1 thing needs' : `${waitingOnMe.length} things need`} your decision →
        </Link>
      )}

      {(changes.data?.length ?? 0) > 0 && (
        <Card className="mb-3 border-brand/30 bg-brand-soft/40 p-3 text-sm text-slate-700">
          Since your last visit: {changes.data!.length} change{changes.data!.length === 1 ? '' : 's'} to your balance
          {changeNet !== 0 && <> ({changeNet > 0 ? 'owed to you ' : 'you owe '}<Taka poisha={Math.abs(changeNet)} className="font-medium" /> more)</>}.
          {' '}<Link to={`/groups/${groupId}/history`} className="font-medium text-brand underline">See what changed</Link>
        </Card>
      )}

      <BalanceCard groupId={groupId} pairs={pairs} loading={pairwise.isLoading} />

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link to={`/groups/${groupId}/add`} className="col-span-2"><Button block size="lg">+ {t('action.addExpense')}</Button></Link>
        <Link to={`/groups/${groupId}/settle`}><Button block variant="outline">{t('action.settleUp')}</Button></Link>
        <Link to={`/groups/${groupId}/transfer`}><Button block variant="outline">{t('action.transfer')}</Button></Link>
        <Link to={`/groups/${groupId}/trips`}><Button block variant="secondary">{t('action.trips')}</Button></Link>
        <Link to={`/groups/${groupId}/history`}><Button block variant="secondary">{t('action.history')}</Button></Link>
      </div>

      {activeTrips.length > 0 && (
        <>
          <SectionTitle>Active trips</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {activeTrips.map((tr) => (
              <Link key={tr.id} to={`/trips/${tr.id}`}><Badge tone="brand" className="px-3 py-1.5 text-sm">🧭 {tr.name}</Badge></Link>
            ))}
          </div>
        </>
      )}

      {group.data && (params.get('new') || (members.data && members.data.length < 2)) && (
        <div className="mt-4"><InviteCard groupName={group.data.name} code={group.data.invite_code} /></div>
      )}

      <SectionTitle action={<TextLink to={`/groups/${groupId}/history`}>All history</TextLink>}>Recent</SectionTitle>
      {expenses.isLoading ? <ListSkeleton /> : (expenses.data?.length ?? 0) === 0 ? (
        <p className="rounded-2xl bg-white p-4 text-sm text-slate-500">No expenses yet. Add the first one — it takes ten seconds.</p>
      ) : (
        <div className="space-y-2">
          {expenses.data!.slice(0, 5).map((e) => (
            <ExpenseRow key={e.id} expense={e} groupId={groupId} me={me} name={(id) => name(id, { you: true })}
                        attribution={attribution.data?.get(e.id)} />
          ))}
        </div>
      )}

      <SectionTitle>Members</SectionTitle>
      <p className="text-sm text-slate-600">
        {(members.data ?? []).map((m) => (m.user_id === me ? 'You' : m.profile.display_name)).join(', ')}
      </p>
    </AppShell>
  );
}
