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

/** Logo + Bangla wordmark. */
export function BrandLockup({
  size = 'md',
  stacked = false,
  showRoman = false,
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  stacked?: boolean;
  showRoman?: boolean;
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
        <span className={cn('font-display font-semibold leading-none tracking-tight text-ink', bangla)}>
          {t('app.name')}
        </span>
        {showRoman && (
          <span className="mt-1 block text-[13px] font-medium tracking-wide text-ink-soft">
            {t('app.nameRoman')}
          </span>
        )}
      </div>
    </div>
  );
}
