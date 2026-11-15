/** Integer-paisa helpers for the tour side-feature (blueprint money.ts). */

export const MAX_PAISA = 1_000_000_000_000;

export class TourMoneyError extends Error {}

export function parseTakaToPaisa(
  input: string,
  options: { allowZero?: boolean } = {},
): number {
  if (typeof input !== 'string') {
    throw new TourMoneyError('Amount must be a string.');
  }
  const trimmed = input.trim();
  if (trimmed === '') {
    throw new TourMoneyError('Amount is required.');
  }
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) {
    throw new TourMoneyError(`"${input}" is not a valid amount (max 2 decimals).`);
  }
  const whole = match[1]!;
  const frac = (match[2] ?? '').padEnd(2, '0');
  const paisa = Number(whole) * 100 + Number(frac);

  if (!Number.isSafeInteger(paisa)) {
    throw new TourMoneyError('Amount is too large.');
  }
  if (paisa <= 0 && !options.allowZero) {
    throw new TourMoneyError('Amount must be greater than zero.');
  }
  if (paisa > MAX_PAISA) {
    throw new TourMoneyError('Amount exceeds the allowed maximum.');
  }
  return paisa;
}

export function coercePaisa(value: unknown): number {
  if (typeof value === 'string' && !/^\d+$/.test(value)) {
    throw new TourMoneyError('Stored amount is not a safe integer.');
  }
  const n = typeof value === 'string' ? Number(value) : (value as number);
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) {
    throw new TourMoneyError('Stored amount is not a safe integer.');
  }
  if (n < 0 || n > MAX_PAISA) {
    throw new TourMoneyError('Stored amount is out of range.');
  }
  return n;
}

export function formatPaisa(paisa: number): string {
  const sign = paisa < 0 ? '-' : '';
  const abs = Math.abs(paisa);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${sign}${whole.toLocaleString('en-US')}.${frac.toString().padStart(2, '0')}`;
}

export function formatTourTaka(paisa: number): string {
  return `৳${formatPaisa(paisa)}`;
}
