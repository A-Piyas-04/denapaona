import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell, SectionTitle } from '@/components/AppShell';
import { Avatar, Badge, Button, Card, Sheet } from '@/components/ui';
import { InviteCard } from '@/components/InviteCard';
import { useToast } from '@/components/Toast';
import { useMe } from '@/hooks/useAuth';
import { useGroup, useMembers } from '@/hooks/useGroups';
import { rpc } from '@/lib/rpc';
import { errorMessage } from '@/lib/errors';

/** Stories A-05 (rotate invite), A-06 (leave), ownership hand-over. */
export function GroupSettings() {
  const { id: groupId = '' } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const group = useGroup(groupId);
  const members = useMembers(groupId);
  const [confirm, setConfirm] = useState<'rotate' | 'leave' | null>(null);
  const [busy, setBusy] = useState(false);
  const iAmOwner = members.data?.some((m) => m.user_id === me && m.role === 'owner');

  async function run(fn: () => Promise<unknown>, ok: string, after?: () => void) {
    setBusy(true);
    try { await fn(); toast(ok); void qc.invalidateQueries(); after?.(); }
    catch (e) { toast(errorMessage(e), 'error'); }
    finally { setBusy(false); setConfirm(null); }
  }

  return (
    <AppShell title="Group settings" back={`/groups/${groupId}`}>
      {group.data && (
        <>
          <SectionTitle>Invite link</SectionTitle>
          <InviteCard groupName={group.data.name} code={group.data.invite_code} compact />
          {iAmOwner && (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setConfirm('rotate')}>Reset invite link</Button>
          )}
        </>
      )}

      <SectionTitle>Members</SectionTitle>
      <Card className="divide-y divide-slate-100 p-0">
        {(members.data ?? []).map((m) => (
          <div key={m.user_id} className="flex items-center gap-3 px-4 py-3">
            <Avatar name={m.profile.display_name} url={m.profile.avatar_url} />
            <span className="flex-1 text-[15px]">{m.user_id === me ? 'You' : m.profile.display_name}</span>
            {m.role === 'owner' && <Badge>owner</Badge>}
            {iAmOwner && m.role !== 'owner' && (
              <Button size="sm" variant="ghost" onClick={() =>
                run(() => rpc.transferOwnership(groupId, m.user_id), `${m.profile.display_name} is now the owner`)}>
                Make owner
              </Button>
            )}
          </div>
        ))}
      </Card>

      <div className="mt-8">
        <Button variant="outline" block onClick={() => setConfirm('leave')}>Leave group</Button>
        <p className="mt-2 text-center text-xs text-slate-500">You can only leave once your balance here is zero.</p>
      </div>

      <Sheet open={confirm !== null} onClose={() => setConfirm(null)}
             title={confirm === 'rotate' ? 'Reset the invite link?' : 'Leave this group?'}>
        <p className="text-[15px] text-slate-700">
          {confirm === 'rotate'
            ? 'The old link stops working immediately. Anyone who hasn’t joined yet will need the new one.'
            : 'You’ll disappear from this group’s list. Your history stays, correctly attributed, and you can rejoin with an invite.'}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button busy={busy} variant="danger" onClick={() => confirm === 'rotate'
            ? run(() => rpc.rotateInviteCode(groupId), 'New invite link ready')
            : run(() => rpc.leaveGroup(groupId), 'You left the group', () => navigate('/groups', { replace: true }))}>
            {confirm === 'rotate' ? 'Reset' : 'Leave'}
          </Button>
        </div>
      </Sheet>
    </AppShell>
  );
}
