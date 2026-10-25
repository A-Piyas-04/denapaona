import { useParams } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { SettleSuggestions } from '@/components/SettleSuggestions';
import { InfoSheet } from '@/components/ui';
import { Loadable } from '@/components/States';
import { useMe } from '@/hooks/useAuth';
import { useGroupNets, useNames } from '@/hooks/useGroups';
import { useRealtimeGroup } from '@/hooks/useRealtimeProposals';
import { useT } from '@/lib/i18n';

/** Story F-01 — the fewest payments that square the whole group. */
export function Settle() {
  const { id: groupId = '' } = useParams();
  const me = useMe();
  const t = useT();
  useRealtimeGroup(groupId);
  const nets = useGroupNets(groupId);
  const { name } = useNames(groupId);
  return (
    <AppShell title={t('action.settleUp')} back={`/groups/${groupId}`} action={
      <InfoSheet title="How settling works" label="How settling works">
        <p>These are suggestions: the fewest payments that clear the whole group.</p>
        <p>Pay however you like, in cash or by bKash or Nagad. Then mark it as paid here. The other person confirms before it counts.</p>
      </InfoSheet>
    }>
      <Loadable query={nets}>
        {(rows) => (
          <SettleSuggestions groupId={groupId} me={me} name={(id) => name(id)}
                             nets={new Map(rows.map((r) => [r.user_id, r.net_poisha]))} />
        )}
      </Loadable>
    </AppShell>
  );
}
