import { Share2, UserPlus } from 'lucide-react';
import { Button, Card, IconTile } from './ui';
import { useToast } from './Toast';

export function inviteUrl(code: string) {
  return `${window.location.origin}/join/${code}`;
}

export function useShareInvite(groupName: string, code: string) {
  const toast = useToast();
  const url = inviteUrl(code);
  return async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: groupName, text: `Join “${groupName}” on HishebNama`, url });
        return;
      }
    } catch { /* user cancelled — fall through to copy */ }
    try { await navigator.clipboard.writeText(url); toast('Invite link copied'); }
    catch { toast(url, 'info'); }
  };
}

/** Share the invite link (A-02 step 5, A-03 step 1). */
export function InviteCard({ groupName, code, compact }: { groupName: string; code: string; compact?: boolean }) {
  const share = useShareInvite(groupName, code);
  const url = inviteUrl(code);
  const row = (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-xl bg-slate-100 px-3 py-2.5 text-[13px] text-slate-700">{url}</code>
      <Button size="md" onClick={share}><Share2 size={17} aria-hidden /> Share</Button>
    </div>
  );
  if (compact) return row;
  return (
    <Card className="space-y-4 border-brand/20 bg-brand-soft/40 p-5">
      <div className="flex items-center gap-3">
        <IconTile tone="brand" className="bg-white"><UserPlus size={20} /></IconTile>
        <div className="min-w-0">
          <p className="font-display text-[16px] font-semibold text-slate-900">Invite your friends</p>
          <p className="text-[14px] text-slate-600">Anyone with the link can join.</p>
        </div>
      </div>
      {row}
    </Card>
  );
}
