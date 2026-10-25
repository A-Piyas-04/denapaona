import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Chip, Field, Input, Textarea } from './ui';
import { EmptyState } from './States';
import { useToast } from './Toast';
import { rpc } from '@/lib/rpc';
import { errorMessage } from '@/lib/errors';
import { formatTaka, isPartialTakaInput, parseTakaToPoisha, poishaToInput } from '@/lib/money';

/**
 * Story C-01.  You are the intermediary: someone owes you, you owe someone
 * else, and you propose that you drop out of the middle.  The panel shows the
 * state before and after explicitly — users will not approve what they do not
 * understand, and comprehension is the product (§13.3).
 */
export function TransferBuilder({ groupId, me, people, owes }: {
  groupId: string; me: string;
  people: { id: string; name: string }[];
  owes: (a: string, b: string) => number;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const debtors = people.filter((p) => p.id !== me && owes(p.id, me) > 0);
  const creditors = people.filter((p) => p.id !== me && owes(me, p.id) > 0);
  const [debtor, setDebtor] = useState(debtors[0]?.id ?? '');
  const [creditor, setCreditor] = useState(creditors.find((c) => c.id !== debtors[0]?.id)?.id ?? '');
  const [amountStr, setAmountStr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = (id: string) => people.find((p) => p.id === id)?.name ?? '?';
  const leg1 = debtor ? owes(debtor, me) : 0;
  const leg2 = creditor ? owes(me, creditor) : 0;
  const max = Math.max(0, Math.min(leg1, leg2));
  const amount = parseTakaToPoisha(amountStr) ?? (amountStr === '' ? max : 0);
  const valid = !!debtor && !!creditor && debtor !== creditor && amount > 0 && amount <= max;

  const after = useMemo(() => ({
    debtorToMe: leg1 - amount,
    meToCreditor: leg2 - amount,
    debtorToCreditor: (debtor && creditor ? owes(debtor, creditor) : 0) + amount,
  }), [leg1, leg2, amount, debtor, creditor, owes]);

  if (debtors.length === 0 || creditors.length === 0) {
    return (
      <EmptyState
        title="No transfer possible right now"
        body="A transfer needs someone who owes you and someone you owe. Then you can ask them both to deal with each other directly — and both must agree."
      />
    );
  }

  const line = (who: string, whom: string, v: number) =>
    v > 0 ? `${who} owe${who === 'You' ? '' : 's'} ${whom} ${formatTaka(v)}`
    : v < 0 ? `${whom} owe${whom === 'you' ? '' : 's'} ${who === 'You' ? 'you' : who} ${formatTaka(-v)}`
    : `${who} and ${whom} are square`;

  async function send() {
    if (!valid) return;
    setBusy(true); setError(null);
    try {
      const id = await rpc.proposeTransfer({ groupId, debtor, intermediary: me, creditor, amount, note: note.trim() });
      toast(`Sent to ${name(debtor)} and ${name(creditor)} for approval`);
      void qc.invalidateQueries({ queryKey: ['sent'] });
      navigate(`/proposals/${id}`, { replace: true });
    } catch (e) {
      setError(errorMessage(e)); // C-01#5: a leg settled meanwhile — fresh numbers below
      void qc.invalidateQueries({ queryKey: ['allPairs', groupId] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Field label="Who owes you?">
        <div className="flex flex-wrap gap-2">
          {debtors.map((p) => (
            <Chip key={p.id} selected={debtor === p.id} onClick={() => setDebtor(p.id)}>
              {p.name} · {formatTaka(owes(p.id, me))}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="Who do you owe?" hint="They would collect from the first person instead of you.">
        <div className="flex flex-wrap gap-2">
          {creditors.map((p) => (
            <Chip key={p.id} selected={creditor === p.id} disabled={p.id === debtor} onClick={() => setCreditor(p.id)}>
              {p.name} · {formatTaka(owes(me, p.id))}
            </Chip>
          ))}
        </div>
      </Field>

      {debtor && creditor && debtor !== creditor && (
        <>
          <Field label="Amount" hint={`At most ${formatTaka(max)} — the smaller of the two debts.`}>
            <div className="space-y-2">
              <input type="range" min={1} max={Math.max(max, 1)} step={1} value={Math.min(amount || max, max)}
                     aria-label="Transfer amount" className="w-full accent-brand"
                     onChange={(e) => setAmountStr(poishaToInput(Number(e.target.value)))} />
              <Input inputMode="decimal" value={amountStr === '' ? poishaToInput(max) : amountStr}
                     onChange={(e) => isPartialTakaInput(e.target.value) && setAmountStr(e.target.value)} />
            </div>
          </Field>

          <Card className="space-y-3 bg-slate-50">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Right now</p>
              <p className="text-[15px] text-slate-800">{line(name(debtor), 'you', leg1)}.</p>
              <p className="text-[15px] text-slate-800">{line('You', name(creditor), leg2)}.</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand">After, if all three agree</p>
              <p className="text-[15px] font-medium text-slate-900">{line(name(debtor), name(creditor), after.debtorToCreditor)}.</p>
              <p className="text-[15px] text-slate-800">{line(name(debtor), 'you', after.debtorToMe)}.</p>
              <p className="text-[15px] text-slate-800">{line('You', name(creditor), after.meToCreditor)}.</p>
            </div>
            <p className="text-xs text-slate-500">
              {name(debtor)} and {name(creditor)} must both approve. Either can say no, and nothing changes.
            </p>
          </Card>

          <Field label="Note (optional)" htmlFor="transfer-note">
            <Textarea id="transfer-note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)}
                      placeholder="e.g. Saves us a payment each" />
          </Field>
        </>
      )}

      {error && <p className="rounded-xl bg-owe-soft px-3 py-2 text-sm text-owe" role="alert">{error}</p>}
      <Button size="lg" block busy={busy} disabled={!valid} onClick={send}>Send for approval</Button>
    </div>
  );
}
