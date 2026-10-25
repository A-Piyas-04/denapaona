import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { rememberReturnTo, useAuth } from './hooks/useAuth';
import { useRealtimeInbox } from './hooks/useRealtimeProposals';
import { supabaseConfigured } from './lib/supabase';
import { Landing } from './routes/Landing';
import { AuthCallback } from './routes/AuthCallback';
import { Groups } from './routes/Groups';
import { GroupDashboard } from './routes/GroupDashboard';
import { AddExpense } from './routes/AddExpense';
import { Settle } from './routes/Settle';
import { Transfer } from './routes/Transfer';
import { History } from './routes/History';
import { ExpenseDetail } from './routes/ExpenseDetail';
import { GroupSettings } from './routes/GroupSettings';
import { Trips } from './routes/Trips';
import { TripDashboard } from './routes/TripDashboard';
import { TripAdd } from './routes/TripAdd';
import { TripClose } from './routes/TripClose';
import { TripLeaders } from './routes/TripLeaders';
import { Explain } from './routes/Explain';
import { Inbox } from './routes/Inbox';
import { ProposalDetail } from './routes/ProposalDetail';
import { Join } from './routes/Join';
import { Me } from './routes/Me';
import { Skeleton } from './components/ui';

/** Routes from DEVELOPMENT_PLAN.md §13.1 (plus expense detail, settings, me). */
export function App() {
  if (!supabaseConfigured) return <NotConfigured />;
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/join" element={<Authed><Join /></Authed>} />
      <Route path="/join/:code" element={<Authed><Join /></Authed>} />
      <Route path="/groups" element={<Authed><Groups /></Authed>} />
      <Route path="/groups/:id" element={<Authed><GroupDashboard /></Authed>} />
      <Route path="/groups/:id/add" element={<Authed><AddExpense /></Authed>} />
      <Route path="/groups/:id/settle" element={<Authed><Settle /></Authed>} />
      <Route path="/groups/:id/transfer" element={<Authed><Transfer /></Authed>} />
      <Route path="/groups/:id/history" element={<Authed><History /></Authed>} />
      <Route path="/groups/:id/trips" element={<Authed><Trips /></Authed>} />
      <Route path="/groups/:id/settings" element={<Authed><GroupSettings /></Authed>} />
      <Route path="/groups/:id/expenses/:expenseId" element={<Authed><ExpenseDetail /></Authed>} />
      <Route path="/trips/:id" element={<Authed><TripDashboard /></Authed>} />
      <Route path="/trips/:id/add" element={<Authed><TripAdd /></Authed>} />
      <Route path="/trips/:id/close" element={<Authed><TripClose /></Authed>} />
      <Route path="/trips/:id/leaders" element={<Authed><TripLeaders /></Authed>} />
      <Route path="/explain/:groupId/:otherId" element={<Authed><Explain /></Authed>} />
      <Route path="/proposals" element={<Authed><Inbox /></Authed>} />
      <Route path="/proposals/:id" element={<Authed><ProposalDetail /></Authed>} />
      <Route path="/me" element={<Authed><Me /></Authed>} />
      <Route path="*" element={<Navigate to="/groups" replace />} />
    </Routes>
  );
}

/**
 * Gate for signed-in screens.  This is UX, not security — the database
 * refuses every unauthenticated request on its own (§12).  The intended path
 * survives the sign-in round trip (story A-03#3).
 */
function Authed({ children }: { children: ReactNode }) {
  const { userId, loading } = useAuth();
  const location = useLocation();
  useRealtimeInbox(userId);
  if (loading) {
    return (
      <div className="mx-auto max-w-app space-y-4 px-4 pt-5" aria-busy>
        <Skeleton className="h-8 w-32" /><Skeleton className="h-28 w-full rounded-3xl" /><Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }
  if (!userId) {
    rememberReturnTo(location.pathname + location.search);
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

function NotConfigured() {
  return (
    <div className="mx-auto max-w-app px-6 pt-14">
      <h1 className="text-[22px] font-semibold text-slate-900">HishebNama isn’t configured</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
        Copy <code>.env.example</code> to <code>.env.local</code> and set <code>VITE_SUPABASE_URL</code> and{' '}
        <code>VITE_SUPABASE_ANON_KEY</code>. Never put the service role key in any <code>VITE_</code> variable.
      </p>
    </div>
  );
}
