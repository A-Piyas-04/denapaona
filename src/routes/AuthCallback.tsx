import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { takeReturnTo, useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui';

/**
 * OAuth lands here.  supabase-js picks the session out of the URL; we then
 * return the user to where they were going — typically /join/:code (A-03#3).
 * A cancelled consent screen lands here with no session and goes back to "/"
 * having created nothing (A-01 acceptance).
 */
export function AuthCallback() {
  const { userId, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && userId) navigate(takeReturnTo() ?? '/groups', { replace: true });
  }, [loading, userId, navigate]);
  // getSession() resolves only after supabase-js has processed the URL, so no
  // session at this point means the sign-in was cancelled or failed.
  if (!loading && !userId) return <Navigate to="/" replace />;
  return <div className="mx-auto max-w-app p-6"><Skeleton className="h-8 w-48" /></div>;
}
