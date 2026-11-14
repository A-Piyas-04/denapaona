import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/format';

/**
 * Soft enter on route change — finance apps use restrained motion as a trust
 * signal (content settles in; nothing flashy).  Remounts on pathname so nested
 * tab param changes don't re-animate the whole screen.
 */
export function PageEnter({ children, className }: { children: ReactNode; className?: string }) {
  const { pathname } = useLocation();
  return (
    <div key={pathname} className={cn('animate-page-enter', className)}>
      {children}
    </div>
  );
}

/** Brief branded hold before the first paint of authenticated chrome. */
export function useSplashGate(ready: boolean, minMs = 420) {
  const [show, setShow] = useState(true);
  useEffect(() => {
    if (!ready) {
      setShow(true);
      return;
    }
    const t = window.setTimeout(() => setShow(false), minMs);
    return () => window.clearTimeout(t);
  }, [ready, minMs]);
  return show;
}
