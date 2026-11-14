import { formatTaka } from '@/lib/money';
import { cn } from '@/lib/format';

/**
 * A signed balance from MY point of view: positive = I'm supposed to get
 * (green), negative = I need to give (red), zero = grey.
 */
export function Balance({ poisha, className, settledText = 'All settled' }: {
  poisha: number; className?: string; settledText?: string;
}) {
  if (poisha === 0) return <span className={cn('font-medium text-slate-500', className)}>{settledText}</span>;
  return (
    <span className={cn('font-semibold tnum', poisha > 0 ? 'text-owed' : 'text-owe', className)}>
      {formatTaka(Math.abs(poisha))}
    </span>
  );
}

export function Taka({ poisha, className }: { poisha: number; className?: string }) {
  return <span className={cn('tnum', className)}>{formatTaka(poisha)}</span>;
}
