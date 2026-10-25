import { useParams } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { TransferBuilder } from '@/components/TransferBuilder';
import { ListSkeleton, ErrorState } from '@/components/States';
import { useMe } from '@/hooks/useAuth';
import { useMembers } from '@/hooks/useGroups';
import { useAllPairs } from '@/hooks/usePairs';
import { useT } from '@/lib/i18n';

/** Story C-01 — build a transfer proposal. */
export function Transfer() {
  const { id: groupId = '' } = useParams();
  const me = useMe();
  const t = useT();
  const members = useMembers(groupId);
  const pairs = useAllPairs(groupId);
  const err = members.error ?? pairs.error;
  return (
    <AppShell title={t('action.transfer')} back={`/groups/${groupId}`}>
      <p className="mb-4 text-sm text-slate-600">
        Someone owes you and you owe someone else? Ask them to deal with each other directly, so one payment
        settles two debts. <strong>Both must agree</strong> — a debt is a relationship, not just a number.
      </p>
      {err ? <ErrorState error={err} /> : !members.data || !pairs.data ? <ListSkeleton /> : (
        <TransferBuilder groupId={groupId} me={me} owes={pairs.data.owes}
          people={members.data.map((m) => ({ id: m.user_id, name: m.profile.display_name }))} />
      )}
    </AppShell>
  );
}
