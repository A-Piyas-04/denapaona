import type { CSSProperties, ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, CircleUserRound, Home, Inbox as InboxIcon, MapPinned, Users, WifiOff } from 'lucide-react';
import { BrandLockup } from '@/components/Brand';
import { PageEnter } from '@/components/motion';
import { useInbox } from '@/hooks/useProposals';
import { useOnline } from '@/hooks/useBrowser';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/format';

/**
 * Mobile-first frame. Chrome + cards share one theme family via CSS tokens.
 */
export function AppShell({
  title,
  back,
  action,
  children,
  nav = true,
  fab,
}: {
  title?: ReactNode;
  back?: string | true;
  action?: ReactNode;
  children: ReactNode;
  nav?: boolean;
  fab?: ReactNode;
}) {
  const navigate = useNavigate();
  const online = useOnline();
  const t = useT();
  const root = !back;

  return (
    <div className="app-frame" style={{ '--nav-h': nav ? '68px' : '0px' } as CSSProperties}>
      <a
        href="#main"
        className="sr-only z-50 rounded-xl bg-brand px-4 py-2 font-semibold text-brand-fg shadow-gold focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>

      {title !== undefined && (
        <header className="sticky top-0 z-30 border-b border-night-line/80 bg-night/95 shadow-header backdrop-blur-xl safe-top">
          {root ? (
            <div className="flex h-[4.25rem] items-center gap-2 px-3 pl-4">
              <div className="min-w-0 flex-1">
                <BrandLockup size="sm" />
                {title != null && title !== '' && title !== t('app.name') && (
                  <p className="mt-0.5 truncate pl-[44px] text-[12px] font-medium text-ink-soft">{title}</p>
                )}
              </div>
              {action && <div className="flex shrink-0 items-center gap-0.5">{action}</div>}
            </div>
          ) : (
            <div className="flex h-14 items-center gap-0.5 px-2">
              <button
                type="button"
                onClick={() => (back === true ? navigate(-1) : navigate(back))}
                className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-night-elev"
                aria-label="Back"
              >
                <ChevronLeft size={24} aria-hidden />
              </button>
              <h1 className="min-w-0 flex-1 truncate font-display text-[17px] font-semibold text-ink">
                {title}
              </h1>
              {action && <div className="flex shrink-0 items-center gap-0.5 text-ink">{action}</div>}
            </div>
          )}
        </header>
      )}

      {!online && (
        <div
          className="flex items-center justify-center gap-2 bg-pending-soft px-4 py-2.5 text-[13px] font-medium text-pending"
          role="status"
        >
          <WifiOff size={15} aria-hidden /> {t('offline.banner')}
        </div>
      )}

      <main
        id="main"
        tabIndex={-1}
        className={cn(
          'flex flex-1 flex-col outline-none',
          nav ? (fab ? 'pb-44' : 'pb-28') : 'pb-[max(1.5rem,env(safe-area-inset-bottom))]',
        )}
      >
        <PageEnter className="flex flex-1 flex-col gap-5 px-4 pt-4">
          {children}
        </PageEnter>
      </main>

      {fab}
      {nav && <BottomNav />}
    </div>
  );
}

function BottomNav() {
  const inbox = useInbox();
  const t = useT();
  const location = useLocation();
  const count = inbox.data?.length ?? 0;
  const items = [
    {
      to: '/home',
      label: t('nav.home'),
      icon: Home,
      tour: 'nav-home',
      match: (p: string) => p === '/home' || p.startsWith('/explain/'),
    },
    {
      to: '/groups',
      label: t('nav.groups'),
      icon: Users,
      tour: 'nav-groups',
      match: (p: string) =>
        p.startsWith('/groups') || p.startsWith('/join'),
    },
    {
      to: '/proposals',
      label: t('nav.inbox'),
      icon: InboxIcon,
      tour: 'nav-inbox',
      badge: count,
      match: (p: string) => p.startsWith('/proposals') || p.startsWith('/claim'),
    },
    {
      to: '/tours',
      label: t('nav.tours'),
      icon: MapPinned,
      tour: 'nav-tours',
      match: (p: string) => p.startsWith('/tours'),
    },
    {
      to: '/me',
      label: t('nav.me'),
      icon: CircleUserRound,
      tour: 'nav-me',
      match: (p: string) => p.startsWith('/me'),
    },
  ];

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-app border-t border-night-line/90 bg-night/97 shadow-nav backdrop-blur-xl safe-bottom"
    >
      <div className="flex h-[4.25rem]">
        {items.map(({ to, label, icon: Icon, tour, badge, match }) => {
          const active = match(location.pathname);
          return (
            <NavLink
              key={to}
              to={to}
              data-tour={tour}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'pressable relative flex h-[4.25rem] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold',
                active ? 'text-brand' : 'text-ink-soft',
              )}
            >
              <span
                className={cn(
                  'relative flex h-9 w-14 items-center justify-center rounded-2xl transition-colors duration-200',
                  active && 'bg-brand-muted',
                )}
              >
                <Icon size={22} strokeWidth={active ? 2.3 : 1.7} aria-hidden />
                {!!badge && (
                  <span
                    className="absolute right-1 top-0 min-w-[18px] rounded-full bg-owe px-1 text-center text-[11px] font-bold leading-[18px] text-white ring-2 ring-night"
                    aria-label={`${badge} waiting for you`}
                  >
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </span>
              {label}
              {active && (
                <span className="absolute inset-x-7 top-0 h-0.5 rounded-full bg-brand" aria-hidden />
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
