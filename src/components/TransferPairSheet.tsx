import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight } from 'lucide-react';
import { Avatar, Button, Field, Input, ListGroup, ListRow, Sheet } from './ui';
import { DebtDiagram } from './DebtDiagram';
import { EmptyState } from './States';
import { useToast } from './Toast';
import { rpc } from '@/lib/rpc';
import { errorMessage } from '@/lib/errors';
import { useT } from '@/lib/i18n';
import { formatTaka, isPartialTakaInput, parseTakaToPoisha, poishaToInput } from '@/lib/money';
import { cn } from '@/lib/format';

/**
 * Per-row transfer: you stay the intermediary.  From a "supposed to get" row the
 * other person is the debtor; from a "need to give" row they are the creditor.
 * Pick the other leg, then all three must approve.
 *
 * `poisha` is from my point of view: + they should give me, − I should give them.
 */
export function TransferPairSheet({ open, onClose, groupId, me, otherId, otherName, poisha, people, owes }: {
  open: boolean; onClose: () => void;
  groupId: string; me: string; otherId: string; otherName: string; poisha: number;
  people: { id: string; name: string }[];
  owes: (a: string, b: string) => number;
}) {
  const t = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const iShouldGive = poisha < 0;

  // Fixed role for the row person; the picker fills the other role.
  const fixedDebtor = !iShouldGive ? otherId : null;
  const fixedCreditor = iShouldGive ? otherId : null;

  const options = useMemo(() => {
    if (fixedDebtor) {
      // They should give me → pick someone I need to give to.
      return people.filter((p) => p.id !== me && p.id !== otherId && owes(me, p.id) > 0)
        .map((p) => ({ id: p.id, name: p.name, amount: owes(me, p.id) }));
    }
    // I need to give them → pick someone who should give me.
    return people.filter((p) => p.id !== me && p.id !== otherId && owes(p.id, me) > 0)
      .map((p) => ({ id: p.id, name: p.name, amount: owes(p.id, me) }));
  }, [fixedDebtor, people, me, otherId, owes]);

  const [picked, setPicked] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const first = options[0]?.id ?? '';
    setPicked(first);
    setError(null);
    setBusy(false);
    setAmountStr('');
  }, [open, otherId]); // eslint-disable-line react-hooks/exhaustive-deps -- reset when the row opens

  const debtor = fixedDebtor ?? picked;
  const creditor = fixedCreditor ?? picked;
  const leg1 = debtor ? owes(debtor, me) : 0;
  const leg2 = creditor ? owes(me, creditor) : 0;
  const max = Math.max(0, Math.min(leg1, leg2));
  const amount = parseTakaToPoisha(amountStr) ?? (amountStr === '' ? max : 0);
  const valid = !!debtor && !!creditor && debtor !== creditor && amount > 0 && amount <= max;

  const name = (id: string) => (id === me ? 'You' : people.find((p) => p.id === id)?.name ?? (id === otherId ? otherName : '?'));

  const after = useMemo(() => ({
    debtorToMe: leg1 - amount,
    meToCreditor: leg2 - amount,
    debtorToCreditor: (debtor && creditor ? owes(debtor, creditor) : 0) + amount,
  }), [leg1, leg2, amount, debtor, creditor, owes]);

  async function send() {
    if (!valid) return;
    setBusy(true); setError(null);
    try {
      const id = await rpc.proposeTransfer({ groupId, debtor, intermediary: me, creditor, amount });
      toast(`Sent for approval to ${name(debtor)} and ${name(creditor)}`);
      void qc.invalidateQueries({ queryKey: ['sent'] });
      void qc.invalidateQueries({ queryKey: ['groupPending', groupId] });
      onClose();
      navigate(`/proposals/${id}`);
    } catch (e) {
      setError(errorMessage(e));
      void qc.invalidateQueries({ queryKey: ['allPairs', groupId] });
    } finally {
      setBusy(false);
    }
  }

  const pickLabel = iShouldGive ? t('transfer.pickGet') : t('transfer.pickGive');

  return (
    <Sheet open={open} onClose={onClose} title={`${t('action.transfer')} · ${otherName}`}
           footer={options.length > 0 ? (
             <div className="space-y-2">
               <Button block size="lg" busy={busy} disabled={!valid} onClick={send}>{t('transfer.send')}</Button>
               {valid && (
                 <p className="text-center text-[13px] text-slate-500">
                   {name(debtor)} and {name(creditor)} must both approve.
                 </p>
               )}
             </div>
           ) : undefined}>
      {options.length === 0 ? (
        <EmptyState icon={ArrowLeftRight} title={t('transfer.empty')}
                    body={iShouldGive
                      ? 'You need someone who is supposed to give you money first.'
                      : 'You need someone you are supposed to give money to first.'} />
      ) : (
        <div className="space-y-5">
          <p className="text-[15px] leading-relaxed text-slate-600">
            {iShouldGive
              ? <>Move what you need to give <strong className="font-semibold text-slate-900">{otherName}</strong> onto someone who should give you money.</>
              : <>Move what <strong className="font-semibold text-slate-900">{otherName}</strong> should give you onto someone you need to give to.</>}
          </p>

          <div>
            <p className="mb-2.5 px-1 text-[15px] font-semibold text-slate-900">{pickLabel}</p>
            <ListGroup>
              {options.map((p) => (
                <ListRow key={p.id}
                         onClick={() => { setPicked(p.id); setAmountStr(''); }}
                         leading={<Avatar name={p.name} seed={p.id} />}
                         title={p.name}
                         subtitle={iShouldGive ? `Supposed to give you ${formatTaka(p.amount)}` : `You need to give ${formatTaka(p.amount)}`}
                         className={cn(picked === p.id && 'bg-brand-soft/60')}
                         trailing={
                           <span className={cn('text-[15px] font-semibold tnum', picked === p.id ? 'text-brand-ink' : 'text-slate-700')}>
                             {formatTaka(p.amount)}
                           </span>
                         } />
              ))}
            </ListGroup>
          </div>

          {picked && max > 0 && (
            <>
              <Field label="Amount" htmlFor="transfer-pair-amount" hint={`Up to ${formatTaka(max)}`}>
                <Input id="transfer-pair-amount" inputMode="decimal" className="text-[18px] font-semibold tnum"
                       value={amountStr === '' ? poishaToInput(max) : amountStr}
                       onChange={(e) => isPartialTakaInput(e.target.value) && setAmountStr(e.target.value)} />
              </Field>

              <DebtDiagram
                name={name}
                avatarName={(id) => people.find((p) => p.id === id)?.name ?? (id === otherId ? otherName : '?')}
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
            </>
          )}

          {error && <p className="rounded-2xl bg-owe-soft px-4 py-3 text-[15px] text-owe" role="alert">{error}</p>}
        </div>
      )}
    </Sheet>
  );
}
