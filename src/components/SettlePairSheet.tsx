import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Field, Input, Sheet } from './ui';
import { useToast } from './Toast';
import { rpc } from '@/lib/rpc';
import { errorMessage } from '@/lib/errors';
import { useT } from '@/lib/i18n';
import { formatTaka, isPartialTakaInput, parseTakaToPoisha, poishaToInput } from '@/lib/money';

/**
 * Per-person settle: full zero or a partial amount.  Needs the other person's
 * approval before the ledger moves (`propose_settlement`).
 *
 * `poisha` is from my point of view: + they should give me, − I should give them.
 */
export function SettlePairSheet({ open, onClose, groupId, me, otherId, otherName, poisha }: {
  open: boolean; onClose: () => void;
  groupId?: string; me: string; otherId: string; otherName: string; poisha: number;
}) {
  const t = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const max = Math.abs(poisha);
  const iShouldGive = poisha < 0;
  const [amountStr, setAmountStr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmountStr(poishaToInput(max));
      setError(null);
      setBusy(false);
    }
  }, [open, max]);

  const amount = parseTakaToPoisha(amountStr) ?? 0;
  const valid = amount > 0 && amount <= max;

  async function send() {
    if (!valid) return;
    setBusy(true); setError(null);
    const debtor = iShouldGive ? me : otherId;
    const creditor = iShouldGive ? otherId : me;
    try {
      const id = groupId
        ? await rpc.proposeSettlement({ groupId, debtor, creditor, amount })
        : await rpc.proposeSettlementGlobal({ debtor, creditor, amount });
      toast(iShouldGive
        ? `Sent. ${otherName} confirms they got it.`
        : `Sent. ${otherName} confirms they gave you this.`);
      if (groupId) void qc.invalidateQueries({ queryKey: ['groupPending', groupId] });
      void qc.invalidateQueries({ queryKey: ['sent'] });
      void qc.invalidateQueries({ queryKey: ['inbox'] });
      void qc.invalidateQueries({ queryKey: ['globalPairs'] });
      onClose();
      navigate(`/proposals/${id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={`${t('settle.title')} · ${otherName}`}
           footer={
             <div className="space-y-2">
               <Button block size="lg" busy={busy} disabled={!valid} onClick={send}>{t('settle.send')}</Button>
               <p className="text-center text-[13px] text-slate-500">
                 {iShouldGive ? t('settle.hintGive') : t('settle.hintGet')}
               </p>
             </div>
           }>
      <div className="space-y-5">
        <p className="text-[15px] leading-relaxed text-slate-600">
          {iShouldGive
            ? <>You need to give <strong className="font-semibold text-slate-900">{otherName}</strong> {formatTaka(max)}.</>
            : <><strong className="font-semibold text-slate-900">{otherName}</strong> is supposed to give you {formatTaka(max)}.</>}
        </p>

        <div className="flex gap-2">
          <Button type="button" size="sm" variant={amount === max ? 'primary' : 'secondary'}
                  onClick={() => setAmountStr(poishaToInput(max))}>{t('settle.full')}</Button>
          {max > 1 && (
            <Button type="button" size="sm" variant={amount > 0 && amount < max ? 'primary' : 'secondary'}
                    onClick={() => setAmountStr(poishaToInput(Math.max(1, Math.floor(max / 2))))}>
              {t('settle.partial')}
            </Button>
          )}
        </div>

        <Field label="Amount" htmlFor="settle-amount" hint={`Up to ${formatTaka(max)}`} error={error ?? undefined}>
          <Input id="settle-amount" inputMode="decimal" className="text-[18px] font-semibold tnum"
                 value={amountStr}
                 onChange={(e) => isPartialTakaInput(e.target.value) && setAmountStr(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}
