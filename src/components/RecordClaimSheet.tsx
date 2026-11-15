import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Field, Input, Sheet, Textarea } from './ui';
import { useToast } from './Toast';
import { useClaimPeers } from '@/hooks/useGlobalLedger';
import { rpc } from '@/lib/rpc';
import { errorMessage } from '@/lib/errors';
import { isPartialTakaInput, parseTakaToPoisha } from '@/lib/money';
import { cn } from '@/lib/format';

type Direction = 'get' | 'give';
type Mode = 'peer' | 'invite';

/**
 * Record a balance with an existing peer (needs their approval) or create an
 * invite link for someone new.
 */
export function RecordClaimSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const peers = useClaimPeers();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const [mode, setMode] = useState<Mode>('peer');
  const [direction, setDirection] = useState<Direction>('get');
  const [otherId, setOtherId] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMode('peer');
      setDirection('get');
      setOtherId('');
      setAmountStr('');
      setNote('');
      setBusy(false);
      setError(null);
      setInviteLink(null);
    }
  }, [open]);

  const amount = parseTakaToPoisha(amountStr) ?? 0;
  const canPeer = mode === 'peer' && !!otherId && amount > 0;
  const canInvite = mode === 'invite' && amount > 0;

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'invite') {
        const code = await rpc.createClaimInvite({ direction, amount, note: note.trim() || undefined });
        const link = `${window.location.origin}/claim/${code}`;
        setInviteLink(link);
        toast('Invite ready — share the link.');
        void qc.invalidateQueries({ queryKey: ['sent'] });
      } else {
        const id = await rpc.proposeClaim({
          otherId,
          direction,
          amount,
          note: note.trim() || undefined,
        });
        toast('Sent for approval.');
        void qc.invalidateQueries({ queryKey: ['inbox'] });
        void qc.invalidateQueries({ queryKey: ['sent'] });
        onClose();
        navigate(`/proposals/${id}`);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      toast('Link copied.');
    } catch {
      toast('Couldn’t copy — select the link manually.', 'error');
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Record a balance"
      footer={
        inviteLink ? (
          <Button block size="lg" onClick={copyLink}>Copy invite link</Button>
        ) : (
          <Button
            block
            size="lg"
            busy={busy}
            disabled={!(mode === 'peer' ? canPeer : canInvite)}
            onClick={() => void submit()}
          >
            {mode === 'invite' ? 'Create invite link' : 'Send for approval'}
          </Button>
        )
      }
    >
      <div className="space-y-5">
        <p className="text-[15px] leading-relaxed text-ink-soft">
          Add a debt between you and someone else. They must approve before it hits the ledger.
        </p>

        <div className="flex gap-2 rounded-xl bg-night-elev p-1">
          {([
            ['peer', 'Someone I know'],
            ['invite', 'Invite link'],
          ] as const).map(([m, label]) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => { setMode(m); setInviteLink(null); }}
              className={cn(
                'min-h-[40px] flex-1 rounded-lg px-3 text-sm font-semibold',
                mode === m ? 'bg-paper text-brand shadow-soft' : 'text-ink-soft',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-1">
          <span className="text-sm font-medium text-ink-soft">Direction</span>
          <div className="flex gap-2 rounded-xl bg-night-elev p-1">
            {([
              ['get', "I'm supposed to get"],
              ['give', 'I need to give'],
            ] as const).map(([d, label]) => (
              <button
                key={d}
                type="button"
                aria-pressed={direction === d}
                onClick={() => setDirection(d)}
                className={cn(
                  'min-h-[40px] flex-1 rounded-lg px-3 text-sm font-semibold',
                  direction === d ? 'bg-paper text-brand shadow-soft' : 'text-ink-soft',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {mode === 'peer' && (
          <Field label="Person">
            <select
              value={otherId}
              onChange={(e) => setOtherId(e.target.value)}
              className="h-12 w-full rounded-xl border border-night-line bg-night-elev px-3.5 text-[16px] text-ink"
            >
              <option value="">Select…</option>
              {(peers.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {(peers.data?.length ?? 0) === 0 && (
              <p className="mt-1.5 text-[13px] text-ink-soft">
                No peers yet — use an invite link, or join an outing group first.
              </p>
            )}
          </Field>
        )}

        <Field label="Amount (৳)">
          <Input
            value={amountStr}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '' || isPartialTakaInput(v)) setAmountStr(v);
            }}
            inputMode="decimal"
            placeholder="500"
          />
        </Field>

        <Field label="Note (optional)">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} />
        </Field>

        {inviteLink && (
          <div className="rounded-xl border border-brand/30 bg-brand-muted p-3">
            <p className="text-[13px] font-medium text-ink-soft">Share this link</p>
            <p className="mt-1 break-all text-[14px] font-semibold text-ink">{inviteLink}</p>
          </div>
        )}

        {error && <p className="text-sm text-owe">{error}</p>}
      </div>
    </Sheet>
  );
}
