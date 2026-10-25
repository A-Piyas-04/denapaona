import { formatTaka } from './money';
import type { AmendmentPayload, Proposal, SettlementPayload, TransferPayload, VoidPayload } from './types';

const isYou = (n: string) => n.toLowerCase() === 'you';
const subject = (n: string) => (isYou(n) ? 'you' : n);
const possessive = (n: string) => (isYou(n) ? 'your' : `${n}’s`);
const owes = (n: string) => (isYou(n) ? 'owe' : 'owes');
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One plain-language sentence for a proposal — never identifiers (Feature 4.5). */
export function describeProposal(p: Proposal, name: (id: string) => string, expenseLabel?: string): string {
  switch (p.type) {
    case 'transfer': {
      const t = p.payload as TransferPayload;
      return capitalise(`${possessive(name(t.debtor))} debt of ${formatTaka(t.amount)} moves from ${subject(name(t.intermediary))} to ${subject(name(t.creditor))}`);
    }
    case 'settlement': {
      const s = p.payload as SettlementPayload;
      return capitalise(`${subject(name(s.debtor))} paid ${subject(name(s.creditor))} ${formatTaka(s.amount)}`);
    }
    case 'amendment': {
      const a = p.payload as AmendmentPayload;
      return `What ${subject(name(a.from_user))} ${owes(name(a.from_user))} ${subject(name(a.to_user))} goes ${a.direction === 'increase' ? 'up' : 'down'} by ${formatTaka(a.amount)}`;
    }
    case 'void': {
      void (p.payload as VoidPayload);
      return `Cancel ${expenseLabel ? `“${expenseLabel}”` : 'an expense'}${p.note ? `: ${p.note}` : ''}`;
    }
  }
}
