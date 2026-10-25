import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  userId: string | null;
  loading: boolean;
  signIn: (returnTo?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const RETURN_KEY = 'hn.returnTo';

/** Remember where to come back to across the OAuth redirect (story A-03#3). */
export function rememberReturnTo(path: string) {
  try { sessionStorage.setItem(RETURN_KEY, path); } catch { /* private mode */ }
}
export function takeReturnTo(): string | null {
  try {
    const v = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return v;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    // Fires for token refresh and for sign-out in another tab (stories §12.2).
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_OUT') qc.clear();
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  const value = useMemo<AuthState>(() => ({
    session,
    userId: session?.user.id ?? null,
    loading,
    signIn: async (returnTo) => {
      if (returnTo) rememberReturnTo(returnTo);
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
    },
    signOut: async () => {
      await supabase.auth.signOut();
      qc.clear();
    },
  }), [session, loading, qc]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

/** For screens rendered only behind RequireAuth. */
export function useMe(): string {
  const { userId } = useAuth();
  if (!userId) throw new Error('useMe used outside an authenticated route');
  return userId;
}
