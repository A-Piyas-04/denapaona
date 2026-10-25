/**
 * Money is integers (principle P5).  Every amount in this app is a whole
 * number of poisha (1 taka = 100 poisha).  Taka strings are parsed straight to
 * integer poisha by string manipulation and never pass through a float, so
 * `0.1 + 0.2` problems cannot occur anywhere in the stack (story B-08).
 */

/** Above this, the form asks "That looks unusually large — check the amount."
 *  (§12.6, story B-01 unhappy path 9).  Confirmable, never blocking. */
export const SANITY_BOUND_POISHA = 10_000_000; // ৳100,000

/**
 * Parse what a person typed into integer poisha, or null if it is not a valid
 * non-negative amount.
 *
 *   "1200"      → 120000
 *   "1200.5"    → 120050
 *   "1,200.50"  → 120050   (comma as thousands separator alongside a dot)
 *   "1200,50"   → 120050   (comma as decimal separator — B-08#2)
 *   " 0012 "    → 1200     (leading zeros and spaces trimmed — B-08#3)
 *   "1.234"     → null     (more than two decimals — B-08#1)
 */
export function parseTakaToPoisha(input: string): number | null {
  let s = input.replace(/[\s৳]/g, '');
  if (s === '') return null;

  const hasDot = s.includes('.');
  const commas = (s.match(/,/g) ?? []).length;
  if (hasDot) {
    s = s.replace(/,/g, ''); // with a dot present, commas group thousands
  } else if (commas === 1 && /,\d{1,2}$/.test(s)) {
    s = s.replace(',', '.'); // a single trailing ",dd" is a decimal comma
  } else {
    s = s.replace(/,/g, '');
  }

  const m = /^(\d+)(?:\.(\d{0,2}))?$/.exec(s);
  if (!m) return null;
  const whole = m[1]!.replace(/^0+(?=\d)/, '');
  const frac = (m[2] ?? '').padEnd(2, '0');
  if (whole.length > 13) return null; // stays far inside Number.MAX_SAFE_INTEGER
  return Number(whole) * 100 + Number(frac);
}

/** True while a string is a plausible partial entry (for keystroke filtering). */
export function isPartialTakaInput(input: string): boolean {
  return /^\d{0,13}([.,]\d{0,2})?$/.test(input.replace(/\s/g, ''));
}

/** Group an integer's digits in threes: 1234567 → "1,234,567". */
function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format poisha for display: 123450 → "৳1,234.50".  Integer arithmetic only;
 * the conversion from poisha happens here, at the display layer (§13.3).
 */
export function formatTaka(poisha: number, opts: { sign?: boolean } = {}): string {
  if (!Number.isInteger(poisha)) throw new Error(`formatTaka: non-integer poisha ${poisha}`);
  const neg = poisha < 0;
  const abs = Math.abs(poisha);
  const taka = Math.floor(abs / 100);
  const rem = abs % 100;
  const body = `৳${groupThousands(taka)}.${String(rem).padStart(2, '0')}`;
  if (neg) return `−${body}`;
  return opts.sign && poisha > 0 ? `+${body}` : body;
}

/** Poisha → the editable string shown back in an amount field: 120050 → "1200.50". */
export function poishaToInput(poisha: number): string {
  const taka = Math.floor(poisha / 100);
  const rem = poisha % 100;
  return rem === 0 ? String(taka) : `${taka}.${String(rem).padStart(2, '0')}`;
}

/**
 * Split an integer amount into n shares as evenly as possible (§9.2).
 * Remainder poisha are distributed one each to the first `r` recipients
 * in a stable order (sorted by user id), so the result is deterministic
 * and reproducible by any client.
 */
export function splitEvenly(totalPoisha: number, userIds: string[]): Map<string, number> {
  const ids = [...userIds].sort(); // stable, deterministic order
  const n = ids.length;
  const out = new Map<string, number>();
  if (n === 0) return out;
  const base = Math.floor(totalPoisha / n);
  const remainder = totalPoisha - base * n; // 0 <= remainder < n

  ids.forEach((id, i) => out.set(id, base + (i < remainder ? 1 : 0)));
  return out;
}
// INVARIANT: sum of all shares === totalPoisha, exactly, always.

/**
 * Feature 4.4: "a helper that distributes any unassigned remainder evenly".
 * Keeps every share already entered and spreads what is left across the people
 * who have none yet (or across everyone, if all have one), using splitEvenly
 * so the fixed-order remainder rule is the same as an equal split.
 */
export function splitRemainder(
  totalPoisha: number,
  shares: Map<string, number>,
  userIds: string[],
): Map<string, number> {
  const out = new Map(userIds.map((id) => [id, shares.get(id) ?? 0]));
  const assigned = [...out.values()].reduce((a, b) => a + b, 0);
  const left = totalPoisha - assigned;
  if (left <= 0) return out;
  const empty = userIds.filter((id) => (out.get(id) ?? 0) === 0);
  const targets = empty.length > 0 ? empty : userIds;
  for (const [id, add] of splitEvenly(left, targets)) out.set(id, (out.get(id) ?? 0) + add);
  return out;
}

/** Which ids received one extra poisha in an even split — shown before saving. */
export function remainderRecipients(totalPoisha: number, userIds: string[]): Set<string> {
  const split = splitEvenly(totalPoisha, userIds);
  const base = Math.floor(totalPoisha / Math.max(userIds.length, 1));
  return new Set([...split].filter(([, v]) => v > base).map(([k]) => k));
}

export function sum(values: Iterable<number>): number {
  let s = 0;
  for (const v of values) s += v;
  return s;
}
