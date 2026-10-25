import { useCallback, useEffect, useRef, useState } from 'react';

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

/**
 * Draft restored from local storage after a refresh mid-entry (stories §12.5).
 * Browser storage may be unavailable (private mode); then drafts are simply
 * not kept, and nothing else breaks.
 */
export function useDraft<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void, () => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? { ...initial, ...JSON.parse(raw) } : initial;
    } catch {
      return initial;
    }
  });
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  }, [key, value]);
  const clear = useCallback(() => { try { localStorage.removeItem(key); } catch { /* ignore */ } }, [key]);
  return [value, setValue, clear];
}

/** Per-viewer "last seen" marker for a group, for the what-changed panel (G-02). */
export function useLastSeen(key: string): [string | null, () => void] {
  const [seen] = useState<string | null>(() => {
    try { return localStorage.getItem(key); } catch { return null; }
  });
  const mark = useCallback(() => {
    try { localStorage.setItem(key, new Date().toISOString()); } catch { /* ignore */ }
  }, [key]);
  return [seen, mark];
}
