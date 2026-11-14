import { cn } from '@/lib/format';
import { useT } from '@/lib/i18n';

/** App mark — ledger lines + settlement dot, matching /icon.svg. */
export function LogoMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/icon.svg"
      alt=""
      width={size}
      height={size}
      className={cn('shrink-0 rounded-[22%] shadow-soft', className)}
      draggable={false}
    />
  );
}

/** Logo + wordmark — root headers, splash, and landing. */
export function BrandLockup({
  size = 'md',
  stacked = false,
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  stacked?: boolean;
  className?: string;
}) {
  const t = useT();
  const mark = size === 'lg' ? 56 : size === 'sm' ? 28 : 36;
  const type = size === 'lg' ? 'text-[28px]' : size === 'sm' ? 'text-[17px]' : 'text-[20px]';
  return (
    <div
      className={cn(
        'flex min-w-0 items-center',
        stacked ? 'flex-col gap-3 text-center' : 'gap-2.5',
        className,
      )}
      translate="no"
    >
      <LogoMark size={mark} />
      <span className={cn('font-display font-semibold tracking-tight text-ink', type)}>{t('app.name')}</span>
    </div>
  );
}
