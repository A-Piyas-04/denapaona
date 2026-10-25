import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, BellDot, HandCoins, History as HistoryIcon, Map as MapIcon, Plus, Receipt, Settings, Sparkles, UserPlus } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { BalanceBreakdown, BalanceHero } from '@/components/BalanceCard';
import { ExpenseRow } from '@/components/ExpenseRow';
import { InviteCard } from '@/components/InviteCard';
import {
  ActionBar, Avatar, Badge, Banner, Fab, IconTile, ListGroup, ListRow, MoreMenu, Sheet, Tabs, TextLink, useTabParam,
} from '@/components/ui';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/States';
import { Taka } from '@/components/Money';
import { useMe } from '@/hooks/useAuth';
import { useGroup, useMembers, useMyPairwise, useNames } from '@/hooks/useGroups';
import { useAttribution, useExpenses, useRecentEntries } from '@/hooks/useGroupLedger';
import { useGroupPending } from '@/hooks/useProposals';
import { useTrips } from '@/hooks/useTrips';
import { useRealtimeGroup } from '@/hooks/useRealtimeProposals';
import { useLastSeen } from '@/hooks/useBrowser';
import { useT } from '@/lib/i18n';

const TABS = ['activity', 'balances', 'members'] as const;

/** Group dashboard (§13.1) — stories B-04, A-02 step 5, G-02. */
export function GroupDashboard() {
  const { id: groupId = '' } = useParams();
  const me = useMe();
  const t = useT();
  const [params] = useSearchParams();
  const [tab, setTab] = useTabParam('tab', 'activity', TABS);
  const [inviting, setInviting] = useState(false);
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
  const activeTrips = (trips.data ?? []).filter((tr) => tr.status === 'active');
  const changeNet = (changes.data ?? []).reduce((s, e) => s + (e.to_user === me ? e.amount_poisha : -e.amount_poisha), 0);
  const showInvite = group.data && (params.get('new') || (members.data && members.data.length < 2));

  return (
    <AppShell
      title={group.data?.name ?? ' '}
      back="/groups"
      action={
        <MoreMenu title={group.data?.name ?? 'Group'} items={[
          { label: 'Invite people', icon: UserPlus, onClick: () => setInviting(true) },
          { label: 'Group settings', icon: Settings, to: `/groups/${groupId}/settings` },
        ]} />
      }
      fab={<Fab to={`/groups/${groupId}/add`} label={t('action.addExpense')} icon={Plus} data-tour="add-expense" />}
    >
      {(waitingOnMe.length > 0 || (changes.data?.length ?? 0) > 0) && (
        <div className="space-y-2">
          {waitingOnMe.length > 0 && (
            <Banner tone="pending" icon={BellDot} to="/proposals">
              {waitingOnMe.length === 1 ? '1 request needs your decision' : `${waitingOnMe.length} requests need your decision`}
            </Banner>
          )}
          {(changes.data?.length ?? 0) > 0 && (
            <Banner tone="brand" icon={Sparkles} to={`/groups/${groupId}/history`}>
              {changes.data!.length} change{changes.data!.length === 1 ? '' : 's'} since your last visit
              {changeNet !== 0 && <> ({changeNet > 0 ? '+' : '−'}<Taka poisha={Math.abs(changeNet)} />)</>}
            </Banner>
          )}
        </div>
      )}

      <BalanceHero groupId={groupId} pairs={pairs} loading={pairwise.isLoading} onShowBreakdown={() => setTab('balances')} />

      <ActionBar data-tour="group-actions" items={[
        { icon: HandCoins, label: t('action.settleUp'), to: `/groups/${groupId}/settle` },
        { icon: ArrowLeftRight, label: t('action.transfer'), to: `/groups/${groupId}/transfer` },
        { icon: MapIcon, label: t('action.trips'), to: `/groups/${groupId}/trips` },
        { icon: HistoryIcon, label: t('action.history'), to: `/groups/${groupId}/history` },
      ]} />

      {showInvite && <InviteCard groupName={group.data!.name} code={group.data!.invite_code} />}

      <div>
        <Tabs label="Group sections" value={tab} onChange={setTab} className="mb-4" items={[
          { id: 'activity', label: 'Activity' },
          { id: 'balances', label: 'Balances' },
          { id: 'members', label: 'Members', count: members.data?.length },
        ]} />

        {tab === 'activity' && (
          <div className="space-y-3">
            {activeTrips.length > 0 && (
              <ListGroup>
                {activeTrips.map((tr) => (
                  <ListRow key={tr.id} to={`/trips/${tr.id}`} leading={<IconTile tone="brand"><MapIcon size={20} /></IconTile>}
                           title={tr.name} subtitle="Trip in progress" trailing={<Badge tone="brand">Active</Badge>} />
                ))}
              </ListGroup>
            )}
            {expenses.isLoading ? <ListSkeleton /> : (expenses.data?.length ?? 0) === 0 ? (
              <EmptyState icon={Receipt} title="No expenses yet" body="Add the first one. It takes ten seconds." />
            ) : (
              <>
                <ListGroup>
                  {expenses.data!.slice(0, 5).map((e) => (
                    <ExpenseRow key={e.id} expense={e} groupId={groupId} me={me} name={(id) => name(id, { you: true })}
                                attribution={attribution.data?.get(e.id)} />
                  ))}
                </ListGroup>
                {expenses.data!.length > 5 && (
                  <div className="text-center"><TextLink to={`/groups/${groupId}/history`}>See all activity</TextLink></div>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'balances' && <BalanceBreakdown groupId={groupId} pairs={pairs} loading={pairwise.isLoading} />}

        {tab === 'members' && (
          <ListGroup>
            <ListRow onClick={() => setInviting(true)} leading={<IconTile tone="brand"><UserPlus size={20} /></IconTile>}
                     title={<span className="text-brand">Invite people</span>} subtitle="Share a link to join" chevron />
            {(members.data ?? []).map((m) => (
              <ListRow key={m.user_id}
                       leading={<Avatar name={m.profile.display_name} url={m.profile.avatar_url} seed={m.user_id} />}
                       title={m.user_id === me ? `${m.profile.display_name} (you)` : m.profile.display_name}
                       trailing={m.role === 'owner' ? <Badge>Owner</Badge> : undefined} />
            ))}
          </ListGroup>
        )}
      </div>

      {group.data && (
        <Sheet open={inviting} onClose={() => setInviting(false)} title="Invite people">
          <p className="mb-4 text-[15px] text-slate-600">Anyone with this link can join {group.data.name}.</p>
          <InviteCard groupName={group.data.name} code={group.data.invite_code} compact />
        </Sheet>
      )}
    </AppShell>
  );
}
