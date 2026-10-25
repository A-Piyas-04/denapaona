import { AppShell, SectionTitle } from '@/components/AppShell';
import { ProposalCard } from '@/components/ProposalCard';
import { EmptyState, Loadable } from '@/components/States';
import { useMe } from '@/hooks/useAuth';
import { useInbox, useSentPending } from '@/hooks/useProposals';
import { useProfileNames } from '@/hooks/useProfiles';
import { useT } from '@/lib/i18n';
import type { Proposal } from '@/lib/types';

function idsOf(list: Proposal[] | undefined): string[] {
  return (list ?? []).flatMap((p) => [p.proposer_id, ...(p.proposal_participants ?? []).map((x) => x.user_id),
    ...Object.values(p.payload).filter((v): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v))]);
}

/** Story C-04 — one inbox of things needing my decision. */
export function Inbox() {
  const me = useMe();
  const t = useT();
  const inbox = useInbox();
  const sent = useSentPending();
  const name = useProfileNames([...idsOf(inbox.data), ...idsOf(sent.data)]);
  return (
    <AppShell title={t('inbox.title')}>
      <Loadable query={inbox}>
        {(list) => list.length === 0 ? <EmptyState title={t('inbox.empty')} /> : (
          <div className="space-y-2">
            {list.map((p) => <ProposalCard key={p.id} proposal={p} groupName={p.groups.name} name={(id) => name(id)} me={me} />)}
          </div>
        )}
      </Loadable>
      {(sent.data?.length ?? 0) > 0 && (
        <>
          <SectionTitle>Sent by you, waiting on others</SectionTitle>
          <div className="space-y-2">
            {sent.data!.map((p) => <ProposalCard key={p.id} proposal={p} groupName={p.groups.name} name={(id) => name(id)} me={me} />)}
          </div>
        </>
      )}
    </AppShell>
  );
}
