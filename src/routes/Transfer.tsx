import { useParams } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { TransferBuilder } from '@/components/TransferBuilder';
import { InfoSheet } from '@/components/ui';
import { ErrorState, ScreenSkeleton } from '@/components/States';
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
    <AppShell title={t('action.transfer')} back={`/groups/${groupId}`} nav={false} action={
      <InfoSheet title="How a transfer works" label="How a transfer works">
        <p>Someone should give you money, and you need to give someone else. Ask them to deal with each other directly, so one payment settles two balances.</p>
        <p>Both of them must agree. If either says no, nothing changes.</p>
      </InfoSheet>
    }>
      <p className="-mb-2 px-1 text-[15px] text-slate-600">One payment can clear two debts. Both people must agree.</p>
      {err ? <ErrorState error={err} /> : !members.data || !pairs.data ? <ScreenSkeleton variant="form" /> : (
        <TransferBuilder groupId={groupId} me={me} owes={pairs.data.owes}
          people={members.data.map((m) => ({ id: m.user_id, name: m.profile.display_name }))} />
      )}
    </AppShell>
  );
}
