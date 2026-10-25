import { useParams } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { SettleSuggestions } from '@/components/SettleSuggestions';
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
    <AppShell title={t('action.settleUp')} back={`/groups/${groupId}`}>
      <Loadable query={nets}>
        {(rows) => (
          <SettleSuggestions groupId={groupId} me={me} name={(id) => name(id)}
                             nets={new Map(rows.map((r) => [r.user_id, r.net_poisha]))} />
        )}
      </Loadable>
    </AppShell>
  );
}
