import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useAuth } from '@/hooks/useAuth';
import { TOUR_STEPS, type TourPlace, type TourStep } from './steps';

interface TourApi {
  start: () => void;
  stop: () => void;
}

const TourContext = createContext<TourApi>({ start: () => {}, stop: () => {} });
export const useTour = () => useContext(TourContext);

const doneKey = (userId: string) => `hn.tour.done.${userId}`;

function isDone(userId: string): boolean {
  try { return localStorage.getItem(doneKey(userId)) === '1'; } catch { return true; }
}

function waitFor(selector: string, ms: number): Promise<Element | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const el = document.querySelector(selector);
      if (el && el.getBoundingClientRect().height > 0) return resolve(el);
      if (Date.now() - start > ms) return resolve(null);
      setTimeout(tick, 100);
    };
    tick();
  });
}

/**
 * First-run guided tour (skippable, replayable from Me).  A per-device
 * convenience: completion is kept in local storage and nothing is written to
 * the server.
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const d = useRef<Driver | null>(null);
  const index = useRef(-1);
  const groupId = useRef<string | null>(null);
  const token = useRef(0);
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  const pathFor = useCallback((place: TourPlace | undefined): string | null => {
    switch (place) {
      case 'groups': return '/groups';
      case 'group': return groupId.current ? `/groups/${groupId.current}` : null;
      case 'add': return groupId.current ? `/groups/${groupId.current}/add` : null;
      case 'inbox': return '/proposals';
      case 'me': return '/me';
      default: return null;
    }
  }, []);

  const stop = useCallback(() => {
    token.current++;
    index.current = -1;
    d.current?.destroy();
    d.current = null;
    if (userId) { try { localStorage.setItem(doneKey(userId), '1'); } catch { /* private mode */ } }
  }, [userId]);

  const usable = (s: TourStep) => !(s.place === 'group' || s.place === 'add') || !!groupId.current;

  const show = useCallback(async (i: number, dir: 1 | -1 = 1) => {
    while (i >= 0 && i < TOUR_STEPS.length && !usable(TOUR_STEPS[i]!)) i += dir;
    if (i < 0) i = 0;
    if (i >= TOUR_STEPS.length) { stop(); return; }
    const step = TOUR_STEPS[i]!;
    index.current = i;
    const mine = ++token.current;

    const target = pathFor(step.place);
    if (target && pathRef.current !== target) navigate(target);

    const el = step.element ? await waitFor(step.element, target && pathRef.current !== target ? 3500 : 2500) : null;
    if (mine !== token.current || !d.current) return;

    const isLast = i === TOUR_STEPS.length - 1;
    const waits = !!step.action && !!el && !step.action.test(pathRef.current);
    const first = i === 0;
    d.current.highlight({
      element: el ?? undefined,
      disableActiveInteraction: !waits,
      popover: {
        title: step.title,
        description: el || !step.fallback ? step.body : step.fallback,
        side: step.side,
        align: 'center',
        showButtons: waits ? (first ? ['close'] : ['previous', 'close']) : first ? ['next', 'close'] : ['next', 'previous', 'close'],
        nextBtnText: first ? 'Start tour' : isLast ? 'Done' : 'Next',
        prevBtnText: 'Back',
        onNextClick: () => { void show(i + 1, 1); },
        onPrevClick: () => { void show(i - 1, -1); },
        onCloseClick: () => stop(),
        onPopoverRender: (pop) => {
          if (!first) {
            const progress = document.createElement('p');
            progress.className = 'hn-tour-progress';
            progress.textContent = `Step ${i} of ${TOUR_STEPS.length - 1}`;
            pop.title.before(progress);
          }
          if (!isLast) {
            const skip = document.createElement('button');
            skip.type = 'button';
            skip.className = 'hn-tour-skip';
            skip.textContent = first ? 'Skip' : 'Skip tour';
            skip.onclick = () => stop();
            pop.footer.prepend(skip);
          }
          if (waits && step.hint) {
            const hint = document.createElement('p');
            hint.className = 'hn-tour-hint';
            hint.textContent = step.hint;
            pop.description.after(hint);
          }
          pop.closeButton.setAttribute('aria-label', 'Close tour');
        },
      },
    });
  }, [navigate, pathFor, stop]);

  const start = useCallback(() => {
    d.current?.destroy();
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    d.current = driver({
      animate: !reduce,
      smoothScroll: !reduce,
      overlayColor: '#071E1B',
      overlayOpacity: 0.62,
      stagePadding: 6,
      stageRadius: 16,
      allowClose: true,
      allowKeyboardControl: false,
      overlayClickBehavior: 'none',
      popoverClass: 'hn-tour',
      popoverOffset: 12,
    });
    groupId.current = null;
    void show(0);
  }, [show]);

  // The user acted: the URL now matches what the current step asked for.
  useEffect(() => {
    const step = TOUR_STEPS[index.current];
    if (!step || !d.current) return;
    if (step.action?.test(location.pathname)) {
      if (step.id === 'open-group') groupId.current = location.pathname.split('/')[2] ?? null;
      void show(index.current + 1);
    }
  }, [location.pathname, show]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && d.current) stop(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stop]);

  // First signed-in visit to the groups list.
  useEffect(() => {
    if (!userId || location.pathname !== '/groups' || d.current || isDone(userId)) return;
    const t = setTimeout(() => { if (!d.current && !isDone(userId)) start(); }, 800);
    return () => clearTimeout(t);
  }, [userId, location.pathname, start]);

  useEffect(() => () => { d.current?.destroy(); }, []);

  const api = useMemo(() => ({ start, stop }), [start, stop]);
  return <TourContext.Provider value={api}>{children}</TourContext.Provider>;
}
