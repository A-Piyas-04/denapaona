/**
 * Settlement optimisation (Feature 3, §9.3).  A pure function over derived
 * balances.  It SUGGESTS payments; it never writes to the ledger.  Acting on a
 * suggestion opens a settlement proposal that still needs the counterparty's
 * approval (or, inside an active trip, is recorded by a leader).
 */

export interface Payment {
  from: string;
  to: string;
  amountPoisha: number;
}

/**
 * Produce a small set of payments that settles every balance.
 * Terminates in at most n-1 payments for n people.
 *
 * NOTE: minimising the payment count is NP-hard in the general case
 * (it reduces to set partition), but for friend-group sizes (n < 20) the
 * greedy result is optimal or near-optimal, and the difference is at most
 * a payment or two. This is display logic — correctness of *amounts* is
 * guaranteed by netting; only the *grouping* is heuristic.
 */
export function settle(net: Map<string, number>): Payment[] {
  const debtors = [...net].filter(([, v]) => v < 0).map(([k, v]) => ({ id: k, amt: -v }));
  const creditors = [...net].filter(([, v]) => v > 0).map(([k, v]) => ({ id: k, amt: v }));

  // Ties broken by id so the same balances always produce the same list.
  const order = (a: { id: string; amt: number }, b: { id: string; amt: number }) =>
    b.amt - a.amt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  debtors.sort(order);
  creditors.sort(order);

  const payments: Payment[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i]!;
    const c = creditors[j]!;
    const amount = Math.min(d.amt, c.amt);
    payments.push({ from: d.id, to: c.id, amountPoisha: amount });

    d.amt -= amount;
    c.amt -= amount;

    if (d.amt === 0) i++;
    if (c.amt === 0) j++;
  }

  return payments;
}
