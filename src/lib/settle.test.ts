import { describe, expect, it } from 'vitest';
import { settle, type Payment } from './settle';

function apply(net: Map<string, number>, payments: Payment[]): Map<string, number> {
  const out = new Map(net);
  for (const p of payments) {
    out.set(p.from, (out.get(p.from) ?? 0) + p.amountPoisha);
    out.set(p.to, (out.get(p.to) ?? 0) - p.amountPoisha);
  }
  return out;
}

describe('settle (§9.3, story F-01)', () => {
  it('returns nothing when everyone is square (F-01#1)', () => {
    expect(settle(new Map([['a', 0], ['b', 0]]))).toEqual([]);
    expect(settle(new Map())).toEqual([]);
  });

  it('settles the Feature 4.1 worked example exactly', () => {
    const net = new Map([['A', 4666], ['B', 4667], ['C', -5333], ['D', -2000], ['E', -2000]]);
    const p = settle(net);
    expect(p.length).toBeLessThanOrEqual(4);
    expect([...apply(net, p).values()].every((v) => v === 0)).toBe(true);
  });

  it('collapses "eight people, two paid, unequal orders" into ≤ n−1 payments', () => {
    const net = new Map([
      ['p1', 520000], ['p2', 280000],
      ['a', -150000], ['b', -90000], ['c', -110000], ['d', -200000], ['e', -120000], ['f', -130000],
    ]);
    const p = settle(net);
    expect(p.length).toBeLessThanOrEqual(7);
    expect([...apply(net, p).values()].every((v) => v === 0)).toBe(true);
  });

  it('F-01 acceptance: random balances → ≤ n−1 payments that zero everyone', () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let trial = 0; trial < 500; trial++) {
      const n = 2 + Math.floor(rnd() * 18);
      const net = new Map<string, number>();
      let total = 0;
      for (let i = 0; i < n - 1; i++) {
        const v = Math.floor(rnd() * 200000) - 100000;
        net.set(`u${i}`, v);
        total += v;
      }
      net.set(`u${n - 1}`, -total); // sums to zero, like every real group (I1)
      const nonZero = [...net.values()].filter((v) => v !== 0).length;
      const p = settle(net);
      expect(p.length).toBeLessThanOrEqual(Math.max(nonZero - 1, 0));
      expect(p.every((x) => x.amountPoisha > 0 && Number.isInteger(x.amountPoisha))).toBe(true);
      expect([...apply(net, p).values()].every((v) => v === 0)).toBe(true);
    }
  });

  it('is deterministic for tied balances', () => {
    const net = new Map([['b', -100], ['a', -100], ['y', 100], ['x', 100]]);
    expect(settle(net)).toEqual(settle(new Map([...net].reverse())));
  });
});
