import { CheckCircle2, Send } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ProposalCard } from '@/components/ProposalCard';
import { EmptyState, Loadable } from '@/components/States';
import { Tabs, useTabParam } from '@/components/ui';
import { useMe } from '@/hooks/useAuth';
import { useInbox, useSentPending } from '@/hooks/useProposals';
import { useProfileNames } from '@/hooks/useProfiles';
import { useT } from '@/lib/i18n';
import type { Proposal } from '@/lib/types';

function idsOf(list: Proposal[] | undefined): string[] {
  return (list ?? []).flatMap((p) => [p.proposer_id, ...(p.proposal_participants ?? []).map((x) => x.user_id),
    ...Object.values(p.payload).filter((v): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v))]);
}

const TABS = ['for-you', 'sent'] as const;

/** Story C-04 — one inbox of things needing my decision. */
export function Inbox() {
  const me = useMe();
  const t = useT();
  const inbox = useInbox();
  const sent = useSentPending();
  const [tab, setTab] = useTabParam('tab', 'for-you', TABS);
  const name = useProfileNames([...idsOf(inbox.data), ...idsOf(sent.data)]);
  return (
    <AppShell title={t('inbox.title')}>
      <div>
        <Tabs label="Inbox sections" value={tab} onChange={setTab} className="mb-4" items={[
          { id: 'for-you', label: t('inbox.forYou'), count: inbox.data?.length },
          { id: 'sent', label: t('inbox.sent'), count: sent.data?.length },
        ]} />
        {tab === 'for-you' ? (
          <Loadable query={inbox}>
            {(list) => list.length === 0
              ? <EmptyState icon={CheckCircle2} title={t('inbox.empty')} body="Requests that need your OK show up here." />
              : (
                <div className="space-y-3">
                  {list.map((p, i) => (
                    <ProposalCard key={p.id} proposal={p} groupName={p.groups.name} name={(id) => name(id)} me={me}
                                  data-tour={i === 0 ? 'proposal-card' : undefined} />
                  ))}
                </div>
              )}
          </Loadable>
        ) : (
          <Loadable query={sent}>
            {(list) => list.length === 0
              ? <EmptyState icon={Send} title="Nothing waiting on others" body="Requests you send appear here until everyone answers." />
              : (
                <div className="space-y-3">
                  {list.map((p) => <ProposalCard key={p.id} proposal={p} groupName={p.groups.name} name={(id) => name(id)} me={me} />)}
                </div>
              )}
          </Loadable>
        )}
      </div>
    </AppShell>
  );
}
