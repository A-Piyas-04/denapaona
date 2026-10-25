import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Plus } from 'lucide-react';
import { Button, Chip, Field, Input, Section, StickyFooter, Textarea } from './ui';
import { DebtDiagram } from './DebtDiagram';
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
  const [showNote, setShowNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = (id: string) => (id === me ? 'You' : people.find((p) => p.id === id)?.name ?? '?');
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
      <EmptyState icon={ArrowLeftRight} title="No transfer possible right now"
                  body="You need someone who owes you and someone you owe." />
    );
  }

  async function send() {
    if (!valid) return;
    setBusy(true); setError(null);
    try {
      const id = await rpc.proposeTransfer({ groupId, debtor, intermediary: me, creditor, amount, note: note.trim() });
      toast(`Sent for approval to ${name(debtor)} and ${name(creditor)}`);
      void qc.invalidateQueries({ queryKey: ['sent'] });
      navigate(`/proposals/${id}`, { replace: true });
    } catch (e) {
      setError(errorMessage(e)); // C-01#5: a leg settled meanwhile — fresh numbers below
      void qc.invalidateQueries({ queryKey: ['allPairs', groupId] });
    } finally {
      setBusy(false);
    }
  }

  const ready = debtor && creditor && debtor !== creditor;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <Section title="Who owes you?">
        <div className="flex flex-wrap gap-2">
          {debtors.map((p) => (
            <Chip key={p.id} selected={debtor === p.id} onClick={() => setDebtor(p.id)}>
              {p.name} <span className="opacity-75 tnum">{formatTaka(owes(p.id, me))}</span>
            </Chip>
          ))}
        </div>
      </Section>
      <Section title="Who do you owe?">
        <div className="flex flex-wrap gap-2">
          {creditors.map((p) => (
            <Chip key={p.id} selected={creditor === p.id} disabled={p.id === debtor} onClick={() => setCreditor(p.id)}>
              {p.name} <span className="opacity-75 tnum">{formatTaka(owes(me, p.id))}</span>
            </Chip>
          ))}
        </div>
      </Section>

      {ready && (
        <>
          <Field label="Amount" htmlFor="transfer-amount" hint={`Up to ${formatTaka(max)}, the smaller of the two debts.`}>
            <div className="space-y-3">
              <Input id="transfer-amount" inputMode="decimal" className="text-[18px] font-semibold tnum"
                     value={amountStr === '' ? poishaToInput(max) : amountStr}
                     onChange={(e) => isPartialTakaInput(e.target.value) && setAmountStr(e.target.value)} />
              <input type="range" min={1} max={Math.max(max, 1)} step={1} value={Math.min(amount || max, max)}
                     aria-label="Transfer amount" className="w-full accent-brand"
                     onChange={(e) => setAmountStr(poishaToInput(Number(e.target.value)))} />
            </div>
          </Field>

          <DebtDiagram
            name={name}
            avatarName={(id) => people.find((p) => p.id === id)?.name ?? '?'}
            beforeLabel="Right now"
            afterLabel="After, if all three agree"
            before={[
              { a: debtor, b: me, v: leg1 },
              { a: me, b: creditor, v: leg2 },
              ...(owes(debtor, creditor) !== 0 ? [{ a: debtor, b: creditor, v: owes(debtor, creditor) }] : []),
            ]}
            after={[
              { a: debtor, b: creditor, v: after.debtorToCreditor },
              { a: debtor, b: me, v: after.debtorToMe },
              { a: me, b: creditor, v: after.meToCreditor },
            ]}
            highlight={0}
          />

          {showNote ? (
            <Field label="Note (optional)" htmlFor="transfer-note">
              <Textarea id="transfer-note" autoFocus maxLength={300} value={note} onChange={(e) => setNote(e.target.value)}
                        placeholder="e.g. Saves us a payment each" />
            </Field>
          ) : (
            <button type="button" className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-brand" onClick={() => setShowNote(true)}>
              <Plus size={16} aria-hidden /> Add a note
            </button>
          )}
        </>
      )}

      {error && <p className="rounded-2xl bg-owe-soft px-4 py-3 text-[15px] text-owe" role="alert">{error}</p>}
      <StickyFooter>
        <Button size="lg" block busy={busy} disabled={!valid} onClick={send} className="h-14 rounded-2xl text-[16px]">Send for approval</Button>
        {ready && <p className="mt-2 text-center text-[13px] text-slate-500">{name(debtor)} and {name(creditor)} must both approve.</p>}
      </StickyFooter>
    </div>
  );
}
