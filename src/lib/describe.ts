import { formatTaka } from './money';
import type { AmendmentPayload, Proposal, SettlementPayload, TransferPayload, VoidPayload } from './types';

/** One plain-language sentence for a proposal — never identifiers (Feature 4.5). */
export function describeProposal(p: Proposal, name: (id: string) => string, expenseLabel?: string): string {
  switch (p.type) {
    case 'transfer': {
      const t = p.payload as TransferPayload;
      return `${name(t.debtor)}’s debt of ${formatTaka(t.amount)} moves from ${name(t.intermediary)} to ${name(t.creditor)}`;
    }
    case 'settlement': {
      const s = p.payload as SettlementPayload;
      return `${name(s.debtor)} paid ${name(s.creditor)} ${formatTaka(s.amount)}`;
    }
    case 'amendment': {
      const a = p.payload as AmendmentPayload;
      return `What ${name(a.from_user)} owes ${name(a.to_user)} goes ${a.direction === 'increase' ? 'up' : 'down'} by ${formatTaka(a.amount)}`;
    }
    case 'void': {
      void (p.payload as VoidPayload);
      return `Cancel ${expenseLabel ? `“${expenseLabel}”` : 'an expense'}${p.note ? ` — ${p.note}` : ''}`;
    }
  }
}
