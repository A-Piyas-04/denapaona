import { describe, expect, it } from 'vitest';
import {
  formatTaka, parseTakaToPoisha, poishaToInput, remainderRecipients, splitEvenly, splitRemainder, sum,
} from './money';

describe('parseTakaToPoisha (story B-08)', () => {
  it('parses whole and fractional taka to integer poisha', () => {
    expect(parseTakaToPoisha('1200')).toBe(120000);
    expect(parseTakaToPoisha('1200.50')).toBe(120050);
    expect(parseTakaToPoisha('1200.5')).toBe(120050);
    expect(parseTakaToPoisha('0.01')).toBe(1);
  });

  it('accepts a comma as decimal separator (B-08#2)', () => {
    expect(parseTakaToPoisha('1200,50')).toBe(120050);
    expect(parseTakaToPoisha('3,5')).toBe(350);
  });

  it('treats commas as thousands separators otherwise', () => {
    expect(parseTakaToPoisha('1,200')).toBe(120000);
    expect(parseTakaToPoisha('1,200.50')).toBe(120050);
    expect(parseTakaToPoisha('12,345,678')).toBe(1234567800);
  });

  it('trims leading zeros, spaces and the taka sign (B-08#3)', () => {
    expect(parseTakaToPoisha('  0012 ')).toBe(1200);
    expect(parseTakaToPoisha('৳ 50')).toBe(5000);
    expect(parseTakaToPoisha('000')).toBe(0);
  });

  it('rejects more than two decimal places and garbage (B-08#1)', () => {
    expect(parseTakaToPoisha('1.234')).toBeNull();
    expect(parseTakaToPoisha('')).toBeNull();
    expect(parseTakaToPoisha('abc')).toBeNull();
    expect(parseTakaToPoisha('-5')).toBeNull();
    expect(parseTakaToPoisha('1.2.3')).toBeNull();
    expect(parseTakaToPoisha('1e5')).toBeNull();
  });

  it('never drifts: 0.1 + 0.2 is exactly 30 poisha (B-08 acceptance)', () => {
    expect(parseTakaToPoisha('0.1')! + parseTakaToPoisha('0.2')!).toBe(30);
    // the float pitfall this avoids:
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it('handles every two-decimal value in a range exactly', () => {
    for (let p = 0; p < 100_000; p += 7) {
      expect(parseTakaToPoisha(poishaToInput(p))).toBe(p);
    }
  });
});

describe('formatTaka', () => {
  it('formats with grouping and two decimals', () => {
    expect(formatTaka(123450)).toBe('৳1,234.50');
    expect(formatTaka(0)).toBe('৳0.00');
    expect(formatTaka(5)).toBe('৳0.05');
    expect(formatTaka(100000000)).toBe('৳1,000,000.00');
  });
  it('signs negatives, and positives on request', () => {
    expect(formatTaka(-3334)).toBe('−৳33.34');
    expect(formatTaka(3334, { sign: true })).toBe('+৳33.34');
  });
  it('refuses non-integers — a float reaching the display layer is a bug', () => {
    expect(() => formatTaka(1.5)).toThrow();
  });
});

describe('splitEvenly (§9.2)', () => {
  it('splits ৳100 three ways as 3334 / 3333 / 3333 (B-01 acceptance)', () => {
    const s = splitEvenly(10000, ['c', 'a', 'b']);
    expect(s.get('a')).toBe(3334);
    expect(s.get('b')).toBe(3333);
    expect(s.get('c')).toBe(3333);
  });

  it('assigns remainders in sorted-id order regardless of input order', () => {
    const one = splitEvenly(10001, ['z', 'y', 'x']);
    const two = splitEvenly(10001, ['x', 'z', 'y']);
    expect([...one].sort()).toEqual([...two].sort());
    expect(one.get('x')).toBe(3334);
    expect(one.get('y')).toBe(3334);
    expect(one.get('z')).toBe(3333);
  });

  it('splits ৳1,200 four ways into 30000 each', () => {
    expect([...splitEvenly(120000, ['a', 'b', 'c', 'd']).values()]).toEqual([30000, 30000, 30000, 30000]);
  });

  it('INVARIANT: shares always sum to the total exactly', () => {
    const ids = Array.from({ length: 15 }, (_, i) => `u${i}`);
    for (let total = 1; total < 5000; total += 13) {
      for (let n = 1; n <= ids.length; n++) {
        const s = splitEvenly(total, ids.slice(0, n));
        expect(sum(s.values())).toBe(total);
        const vals = [...s.values()];
        expect(Math.max(...vals) - Math.min(...vals)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('reports who absorbed the extra poisha', () => {
    expect([...remainderRecipients(10000, ['b', 'a', 'c'])]).toEqual(['a']);
    expect(remainderRecipients(9000, ['a', 'b', 'c']).size).toBe(0);
  });
});

describe('splitRemainder (Feature 4.4 helper, B-02#1)', () => {
  it('spreads the unassigned rest over people with no share yet', () => {
    const out = splitRemainder(120000, new Map([['a', 50000]]), ['a', 'b', 'c']);
    expect(out.get('a')).toBe(50000);
    expect(out.get('b')).toBe(35000);
    expect(out.get('c')).toBe(35000);
    expect(sum(out.values())).toBe(120000);
  });
  it('spreads over everyone when everyone already has a share', () => {
    const out = splitRemainder(1000, new Map([['a', 300], ['b', 300]]), ['a', 'b']);
    expect(sum(out.values())).toBe(1000);
  });
  it('changes nothing when already fully or over-assigned', () => {
    const out = splitRemainder(100, new Map([['a', 150]]), ['a', 'b']);
    expect(out.get('a')).toBe(150);
    expect(out.get('b')).toBe(0);
  });
});
