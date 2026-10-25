import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, PartyPopper } from 'lucide-react';
import { Avatar, Button, ListGroup, ListRow, Sheet } from './ui';
import { EmptyState } from './States';
import { Taka } from './Money';
import { useToast } from './Toast';
import { settle, type Payment } from '@/lib/settle';
import { rpc } from '@/lib/rpc';
import { errorMessage } from '@/lib/errors';
import { formatTaka, poishaToInput } from '@/lib/money';
import { cn } from '@/lib/format';

/**
 * Feature 3 / story F-01.  Suggestions, not state: tapping one opens a
 * settlement proposal the other side must confirm (F-02) — or, inside an
 * active trip, a leader records it directly (D-08).
 */
export function SettleSuggestions({ groupId, me, nets, name, tripId, leaderMode }: {
  groupId: string; me: string; nets: Map<string, number>; name: (id: string) => string;
  tripId?: string; leaderMode?: boolean;
}) {
  const payments = settle(nets);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Payment | null>(null);

  if (payments.length === 0) return <EmptyState icon={PartyPopper} title="Everyone’s square" body="There’s nothing to settle." />;

  const who = (id: string, cap = true) => (id === me ? (cap ? 'You' : 'you') : name(id));
  const sorted = [...payments].sort((a, b) => Number(b.from === me || b.to === me) - Number(a.from === me || a.to === me));

  async function act(p: Payment) {
    setBusy(true);
    try {
      if (leaderMode && tripId) {
        await rpc.leaderRecordSettlement({ tripId, debtor: p.from, creditor: p.to, amount: p.amountPoisha });
        toast(`Payment recorded: ${name(p.from)} paid ${name(p.to)}`);
        void qc.invalidateQueries();
      } else {
        const id = await rpc.proposeSettlement({ groupId, debtor: p.from, creditor: p.to, amount: p.amountPoisha, tripId: tripId ?? null });
        toast(p.from === me ? `Sent. ${name(p.to)} confirms they got it.` : `Sent. ${name(p.from)} confirms they paid.`);
        navigate(`/proposals/${id}`);
      }
      setOpen(null);
    } catch (e) {
      toast(errorMessage(e), 'error');
      void qc.invalidateQueries(); // F-01#3: stale suggestions are never actionable
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ListGroup>
        {sorted.map((p) => {
          const involved = p.from === me || p.to === me;
          const actionable = involved || leaderMode;
          return (
            <ListRow key={`${p.from}>${p.to}`}
                     onClick={actionable ? () => setOpen(p) : undefined}
                     className={cn(involved && 'bg-brand-soft/30')}
                     leading={
                       <span className="flex shrink-0 -space-x-2">
                         <Avatar name={name(p.from)} seed={p.from} size={32} className="ring-2 ring-white" />
                         <Avatar name={name(p.to)} seed={p.to} size={32} className="ring-2 ring-white" />
                       </span>
                     }
                     title={`${who(p.from)} ${p.from === me ? 'pay' : 'pays'} ${who(p.to, false)}`}
                     subtitle={actionable ? (leaderMode ? 'Tap to record' : 'Tap to mark as paid') : undefined}
                     trailing={<Taka poisha={p.amountPoisha} className={cn('text-[16px] font-semibold', p.from === me ? 'text-owe' : p.to === me ? 'text-owed' : 'text-slate-700')} />}
                     chevron={!!actionable} />
          );
        })}
      </ListGroup>
      <p className="-mt-3 px-1 text-[13px] text-slate-500">The fewest payments that square everyone. Any payment counts.</p>

      <Sheet open={!!open} onClose={() => setOpen(null)} title={leaderMode ? 'Record payment' : 'Mark as paid'}
             footer={open && (
               <div className="space-y-2">
                 <Button block size="lg" busy={busy} onClick={() => act(open)}>
                   {leaderMode ? 'Record this payment' : open.from === me ? 'I paid this' : 'I received this'}
                 </Button>
                 {open.from === me && !leaderMode && (
                   <Button block variant="secondary" onClick={async () => {
                     // F-04 fallback: there is no documented bKash/Nagad P2P deep
                     // link that prefills an amount, so copy it instead.
                     try { await navigator.clipboard.writeText(poishaToInput(open.amountPoisha)); toast('Amount copied. Paste it in bKash or Nagad.', 'info'); }
                     catch { toast(`Amount: ${poishaToInput(open.amountPoisha)}`, 'info'); }
                   }}><Copy size={17} aria-hidden /> Copy amount</Button>
                 )}
               </div>
             )}>
        {open && (
          <div className="space-y-3 text-center">
            <div className="flex items-center justify-center -space-x-3 pt-2">
              <Avatar name={name(open.from)} seed={open.from} size={48} className="ring-4 ring-white" />
              <Avatar name={name(open.to)} seed={open.to} size={48} className="ring-4 ring-white" />
            </div>
            <p className="text-[16px] text-slate-700">{who(open.from)} {open.from === me ? 'pay' : 'pays'} {who(open.to, false)}</p>
            <p className="font-display text-[32px] font-semibold text-slate-900 tnum">{formatTaka(open.amountPoisha)}</p>
            <p className="text-[14px] text-slate-500">
              {leaderMode ? 'Recorded straight away. Both of them will see it.'
                : open.from === me ? `${name(open.to)} confirms before it counts. Paying in an app doesn’t record it here.`
                : `${name(open.from)} confirms before it counts.`}
            </p>
          </div>
        )}
      </Sheet>
    </>
  );
}
