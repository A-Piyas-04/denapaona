import { useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { ExpenseForm } from '@/components/ExpenseForm';
import { Loadable } from '@/components/States';
import { useMe } from '@/hooks/useAuth';
import { useMembers } from '@/hooks/useGroups';

/** Stories B-01, B-02, B-03 — a group expense outside any trip. */
export function AddExpense() {
  const { id: groupId = '' } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const members = useMembers(groupId);
  return (
    <AppShell title="New expense" back={`/groups/${groupId}`} nav={false}>
      <Loadable query={members}>
        {(list) => (
          <ExpenseForm
            groupId={groupId}
            me={me}
            roster={list.map((m) => ({ id: m.user_id, name: m.user_id === me ? 'You' : m.profile.display_name }))}
            others={[]}
            onSaved={() => navigate(`/groups/${groupId}`, { replace: true })}
          />
        )}
      </Loadable>
    </AppShell>
  );
}
