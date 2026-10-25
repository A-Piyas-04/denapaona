import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Crown, LogOut, RefreshCw } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Avatar, Badge, Button, IconTile, ListGroup, ListRow, Section, Sheet } from '@/components/ui';
import { InviteCard } from '@/components/InviteCard';
import { ListSkeleton } from '@/components/States';
import { useToast } from '@/components/Toast';
import { useMe } from '@/hooks/useAuth';
import { useGroup, useMembers, type Member } from '@/hooks/useGroups';
import { rpc } from '@/lib/rpc';
import { errorMessage } from '@/lib/errors';

type Confirm = null | { kind: 'rotate' } | { kind: 'leave' } | { kind: 'owner'; member: Member };

/** Stories A-05 (rotate invite), A-06 (leave), ownership hand-over. */
export function GroupSettings() {
  const { id: groupId = '' } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const group = useGroup(groupId);
  const members = useMembers(groupId);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const iAmOwner = members.data?.some((m) => m.user_id === me && m.role === 'owner');

  async function run(fn: () => Promise<unknown>, ok: string, after?: () => void) {
    setBusy(true);
    try { await fn(); toast(ok); void qc.invalidateQueries(); after?.(); }
    catch (e) { toast(errorMessage(e), 'error'); }
    finally { setBusy(false); setConfirm(null); }
  }

  const copy = confirm?.kind === 'rotate'
    ? { title: 'Reset the invite link?', body: 'The old link stops working now. People who haven’t joined need the new one.', verb: 'Reset link' }
    : confirm?.kind === 'leave'
      ? { title: 'Leave this group?', body: 'Your history stays, correctly attributed. You can rejoin with an invite.', verb: 'Leave group' }
      : confirm?.kind === 'owner'
        ? { title: `Make ${confirm.member.profile.display_name} the owner?`, body: 'They can reset the invite link and hand ownership on.', verb: 'Make owner' }
        : null;

  return (
    <AppShell title="Group settings" back={`/groups/${groupId}`}>
      {group.data && (
        <Section title="Invite link">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
            <InviteCard groupName={group.data.name} code={group.data.invite_code} compact />
            <p className="mt-3 text-[13px] text-slate-500">Anyone with this link can join.</p>
          </div>
          {iAmOwner && (
            <ListGroup className="mt-3">
              <ListRow onClick={() => setConfirm({ kind: 'rotate' })} leading={<IconTile><RefreshCw size={20} /></IconTile>}
                       title="Reset invite link" subtitle="Use this if the link was shared too widely" chevron />
            </ListGroup>
          )}
        </Section>
      )}

      <Section title="Members">
        {members.isLoading ? <ListSkeleton rows={3} /> : (
          <ListGroup>
            {(members.data ?? []).map((m) => (
              <ListRow key={m.user_id}
                       leading={<Avatar name={m.profile.display_name} url={m.profile.avatar_url} seed={m.user_id} />}
                       title={m.user_id === me ? `${m.profile.display_name} (you)` : m.profile.display_name}
                       trailing={m.role === 'owner' ? <Badge><Crown size={12} aria-hidden /> Owner</Badge>
                         : iAmOwner ? <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'owner', member: m })}>Make owner</Button>
                         : undefined} />
            ))}
          </ListGroup>
        )}
      </Section>

      <div>
        <ListGroup>
          <ListRow onClick={() => setConfirm({ kind: 'leave' })} tone="danger" leading={<IconTile tone="owe"><LogOut size={20} /></IconTile>}
                   title="Leave group" />
        </ListGroup>
        <p className="mt-2 px-1 text-[13px] text-slate-500">You can leave once your balance here is zero.</p>
      </div>

      <Sheet open={confirm !== null} onClose={() => setConfirm(null)} title={copy?.title ?? ''}
             footer={
               <div className="grid grid-cols-2 gap-2">
                 <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
                 <Button busy={busy} variant={confirm?.kind === 'owner' ? 'primary' : 'danger'} onClick={() => {
                   if (confirm?.kind === 'rotate') void run(() => rpc.rotateInviteCode(groupId), 'New invite link ready');
                   else if (confirm?.kind === 'leave') void run(() => rpc.leaveGroup(groupId), 'You left the group', () => navigate('/groups', { replace: true }));
                   else if (confirm?.kind === 'owner') {
                     const m = confirm.member;
                     void run(() => rpc.transferOwnership(groupId, m.user_id), `${m.profile.display_name} is now the owner`);
                   }
                 }}>{copy?.verb}</Button>
               </div>
             }>
        <p className="text-[15px] text-slate-700">{copy?.body}</p>
      </Sheet>
    </AppShell>
  );
}
