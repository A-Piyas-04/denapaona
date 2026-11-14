import { cn } from '@/lib/format';
import { useT } from '@/lib/i18n';

/** App mark — দেনা ↓ / পাওনা ↑ meeting at a gold settlement node. */
export function LogoMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/icon.svg"
      alt=""
      width={size}
      height={size}
      className={cn('shrink-0 rounded-[22%] shadow-gold', className)}
      draggable={false}
    />
  );
}

/**
 * Logo + Bangla wordmark. Brand is always দেনা পাওনা; romanization is optional support text.
 */
export function BrandLockup({
  size = 'md',
  stacked = false,
  showRoman = false,
  light = true,
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  stacked?: boolean;
  showRoman?: boolean;
  /** Light wordmark for dark chrome (default). */
  light?: boolean;
  className?: string;
}) {
  const t = useT();
  const mark = size === 'lg' ? 64 : size === 'sm' ? 32 : 40;
  const bangla = size === 'lg' ? 'text-[32px]' : size === 'sm' ? 'text-[18px]' : 'text-[22px]';
  return (
    <div
      className={cn(
        'flex min-w-0 items-center',
        stacked ? 'flex-col gap-3.5 text-center' : 'gap-3',
        className,
      )}
      translate="no"
    >
      <LogoMark size={mark} />
      <div className={cn('min-w-0', stacked && 'flex flex-col items-center')}>
        <span
          className={cn(
            'font-display font-semibold leading-none tracking-tight',
            bangla,
            light ? 'text-paper' : 'text-ink',
          )}
        >
          {t('app.name')}
        </span>
        {showRoman && (
          <span className={cn('mt-1 block text-[13px] font-medium tracking-wide', light ? 'text-cream/55' : 'text-ink-soft')}>
            {t('app.nameRoman')}
          </span>
        )}
      </div>
    </div>
  );
}
