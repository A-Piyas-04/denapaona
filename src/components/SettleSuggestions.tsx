import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card } from './ui';
import { EmptyState } from './States';
import { Taka } from './Money';
import { useToast } from './Toast';
import { settle } from '@/lib/settle';
import { rpc } from '@/lib/rpc';
import { errorMessage } from '@/lib/errors';
import { poishaToInput } from '@/lib/money';

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
  const [busy, setBusy] = useState<string | null>(null);

  if (payments.length === 0) return <EmptyState title="Everyone’s square." body="There’s nothing to settle." />;

  async function act(from: string, to: string, amount: number) {
    const key = `${from}>${to}`;
    setBusy(key);
    try {
      if (leaderMode && tripId) {
        await rpc.leaderRecordSettlement({ tripId, debtor: from, creditor: to, amount });
        toast(`Recorded: ${name(from)} paid ${name(to)}`);
        void qc.invalidateQueries();
      } else {
        const id = await rpc.proposeSettlement({ groupId, debtor: from, creditor: to, amount, tripId: tripId ?? null });
        toast(from === me ? `Sent — ${name(to)} needs to confirm they received it` : `Sent — ${name(from)} needs to confirm`);
        navigate(`/proposals/${id}`);
      }
    } catch (e) {
      toast(errorMessage(e), 'error');
      void qc.invalidateQueries(); // F-01#3: stale suggestions are never actionable
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      {payments.map((p) => {
        const involved = p.from === me || p.to === me;
        const key = `${p.from}>${p.to}`;
        return (
          <Card key={key} className="p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[15px] text-slate-800">
                <strong>{p.from === me ? 'You' : name(p.from)}</strong> pay{p.from === me ? '' : 's'}{' '}
                <strong>{p.to === me ? 'you' : name(p.to)}</strong>
              </p>
              <Taka poisha={p.amountPoisha} className="font-semibold" />
            </div>
            {(involved || leaderMode) && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" busy={busy === key} onClick={() => act(p.from, p.to, p.amountPoisha)}>
                  {leaderMode ? 'Record this payment' : p.from === me ? 'I paid this' : 'I received this'}
                </Button>
                {p.from === me && (
                  <Button size="sm" variant="outline" onClick={async () => {
                    // F-04 fallback: there is no documented bKash/Nagad P2P deep
                    // link that prefills an amount, so copy it instead.
                    try { await navigator.clipboard.writeText(poishaToInput(p.amountPoisha)); toast('Amount copied — paste it in bKash or Nagad', 'info'); }
                    catch { toast(`Amount: ${poishaToInput(p.amountPoisha)}`, 'info'); }
                  }}>Copy amount</Button>
                )}
              </div>
            )}
            {p.from === me && !leaderMode && (
              <p className="mt-2 text-xs text-slate-500">Paying in an app doesn’t record it here — tap “I paid this” afterwards.</p>
            )}
          </Card>
        );
      })}
      <p className="pt-1 text-xs text-slate-500">
        Suggestions only — the fewest payments that square everyone. You can always pay someone else instead.
      </p>
    </div>
  );
}
