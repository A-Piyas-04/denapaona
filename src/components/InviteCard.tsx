import { Button, Card } from './ui';
import { useToast } from './Toast';

export function inviteUrl(code: string) {
  return `${window.location.origin}/join/${code}`;
}

/** Share the invite link (A-02 step 5, A-03 step 1). */
export function InviteCard({ groupName, code, compact }: { groupName: string; code: string; compact?: boolean }) {
  const toast = useToast();
  const url = inviteUrl(code);
  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: groupName, text: `Join “${groupName}” on HishebNama`, url });
        return;
      }
    } catch { /* user cancelled — fall through to copy */ }
    try { await navigator.clipboard.writeText(url); toast('Invite link copied'); }
    catch { toast(url, 'info'); }
  }
  return (
    <Card className={compact ? 'p-3' : 'bg-brand-soft/50'}>
      {!compact && <p className="mb-1 font-medium text-slate-900">Invite your friends</p>}
      {!compact && <p className="mb-3 text-sm text-slate-600">Anyone with this link can join. Send it to the group chat.</p>}
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-2 py-2 text-xs text-slate-700">{url}</code>
        <Button size="sm" onClick={share}>Share</Button>
      </div>
    </Card>
  );
}
