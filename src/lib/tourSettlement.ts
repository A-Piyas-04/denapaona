/**
 * Pure pairwise tour settlement (ported from tour-e-chol).
 * Opposite debts between the same two people cancel; never rewrite A→B→C into A→C.
 */

export interface Contribution {
  user_id: string;
  amount_paisa: number;
}

export type SplitMode = 'equal' | 'individual';

export interface ExpenseInput {
  participant_ids: string[];
  amount_paisa: number;
  contributions: Contribution[];
  split_mode?: SplitMode;
  shares?: Contribution[];
}

export interface Transfer {
  from: string;
  to: string;
  paisa: number;
}

export interface UserLists {
  give: { userId: string; paisa: number }[];
  get: { userId: string; paisa: number }[];
  totalGive: number;
  totalGet: number;
}

export function computeShares(
  amountPaisa: number,
  participantIds: string[],
): Map<string, number> {
  const ids = [...new Set(participantIds)].sort();
  const n = ids.length;
  const shares = new Map<string, number>();
  if (n === 0) return shares;

  const baseShare = Math.floor(amountPaisa / n);
  const remainder = amountPaisa % n;
  ids.forEach((id, i) => {
    shares.set(id, baseShare + (i < remainder ? 1 : 0));
  });
  return shares;
}

export function expenseShares(expense: ExpenseInput): Map<string, number> {
  if (expense.split_mode !== 'individual') {
    return computeShares(expense.amount_paisa, expense.participant_ids);
  }
  const shares = new Map<string, number>();
  for (const s of expense.shares ?? []) {
    shares.set(s.user_id, (shares.get(s.user_id) ?? 0) + s.amount_paisa);
  }
  return shares;
}

export function expenseNet(expense: ExpenseInput): Map<string, number> {
  const net = new Map<string, number>();
  const add = (id: string, delta: number) => net.set(id, (net.get(id) ?? 0) + delta);

  const shares = expenseShares(expense);
  for (const [id, share] of shares) add(id, -share);
  for (const c of expense.contributions) add(c.user_id, c.amount_paisa);

  for (const [id, value] of net) if (value === 0) net.delete(id);
  return net;
}

export function expenseTransfers(expense: ExpenseInput): Transfer[] {
  const net = expenseNet(expense);

  const creditors = [...net.entries()]
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, remaining: v }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const debtors = [...net.entries()]
    .filter(([, v]) => v < 0)
    .map(([id, v]) => ({ id, remaining: -v }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const transfers: Transfer[] = [];
  let ci = 0;
  let di = 0;
  while (di < debtors.length && ci < creditors.length) {
    const debtor = debtors[di]!;
    const creditor = creditors[ci]!;
    const amount = Math.min(debtor.remaining, creditor.remaining);
    if (amount > 0 && debtor.id !== creditor.id) {
      transfers.push({ from: debtor.id, to: creditor.id, paisa: amount });
    }
    debtor.remaining -= amount;
    creditor.remaining -= amount;
    if (debtor.remaining === 0) di++;
    if (creditor.remaining === 0) ci++;
  }
  return transfers;
}

export function settle(expenses: ExpenseInput[]): Transfer[] {
  const directed = new Map<string, number>();
  for (const expense of expenses) {
    for (const t of expenseTransfers(expense)) {
      const key = `${t.from}\u0000${t.to}`;
      directed.set(key, (directed.get(key) ?? 0) + t.paisa);
    }
  }

  const result: Transfer[] = [];
  const handledPairs = new Set<string>();
  for (const key of directed.keys()) {
    const [from, to] = key.split('\u0000') as [string, string];
    const pairKey = from < to ? `${from}\u0000${to}` : `${to}\u0000${from}`;
    if (handledPairs.has(pairKey)) continue;
    handledPairs.add(pairKey);

    const forward = directed.get(`${from}\u0000${to}`) ?? 0;
    const backward = directed.get(`${to}\u0000${from}`) ?? 0;
    if (forward > backward) {
      result.push({ from, to, paisa: forward - backward });
    } else if (backward > forward) {
      result.push({ from: to, to: from, paisa: backward - forward });
    }
  }

  result.sort((a, b) =>
    a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : 0,
  );
  return result;
}

export function buildUserLists(transfers: Transfer[], userId: string): UserLists {
  const give: { userId: string; paisa: number }[] = [];
  const get: { userId: string; paisa: number }[] = [];
  for (const t of transfers) {
    if (t.paisa <= 0) continue;
    if (t.from === userId && t.to !== userId) {
      give.push({ userId: t.to, paisa: t.paisa });
    } else if (t.to === userId && t.from !== userId) {
      get.push({ userId: t.from, paisa: t.paisa });
    }
  }
  give.sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
  get.sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
  return {
    give,
    get,
    totalGive: give.reduce((s, r) => s + r.paisa, 0),
    totalGet: get.reduce((s, r) => s + r.paisa, 0),
  };
}
