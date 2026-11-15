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
import { Explain } from './routes/Explain';
import { Inbox } from './routes/Inbox';
import { ProposalDetail } from './routes/ProposalDetail';
import { Join } from './routes/Join';
import { Me } from './routes/Me';
import { Home } from './routes/Home';
import { ClaimInvite } from './routes/ClaimInvite';
import { ToursHome } from './routes/tours/ToursHome';
import { TourBalances } from './routes/tours/TourBalances';
import { TourManage } from './routes/tours/TourManage';
import { TourHistory } from './routes/tours/TourHistory';
import { AuthSplash } from './components/States';
import { BrandLockup } from './components/Brand';

/** Routes: Home global ledger, outing groups, inbox, tours side-feature. */
export function App() {
  if (!supabaseConfigured) return <NotConfigured />;
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/home" element={<Authed><Home /></Authed>} />
      <Route path="/join" element={<Authed><Join /></Authed>} />
      <Route path="/join/:code" element={<Authed><Join /></Authed>} />
      <Route path="/claim/:code" element={<Authed><ClaimInvite /></Authed>} />
      <Route path="/groups" element={<Authed><Groups /></Authed>} />
      <Route path="/groups/:id" element={<Authed><GroupDashboard /></Authed>} />
      <Route path="/groups/:id/add" element={<Authed><AddExpense /></Authed>} />
      <Route path="/groups/:id/settle" element={<Authed><Settle /></Authed>} />
      <Route path="/groups/:id/transfer" element={<Authed><Transfer /></Authed>} />
      <Route path="/groups/:id/history" element={<Authed><History /></Authed>} />
      <Route path="/groups/:id/settings" element={<Authed><GroupSettings /></Authed>} />
      <Route path="/groups/:id/expenses/:expenseId" element={<Authed><ExpenseDetail /></Authed>} />
      <Route path="/explain/:otherId" element={<Authed><Explain /></Authed>} />
      <Route path="/explain/:groupId/:otherId" element={<Authed><Explain /></Authed>} />
      <Route path="/proposals" element={<Authed><Inbox /></Authed>} />
      <Route path="/proposals/:id" element={<Authed><ProposalDetail /></Authed>} />
      <Route path="/tours" element={<Authed><ToursHome /></Authed>} />
      <Route path="/tours/:tourId" element={<Authed><TourBalances /></Authed>} />
      <Route path="/tours/:tourId/manage" element={<Authed><TourManage /></Authed>} />
      <Route path="/tours/:tourId/history" element={<Authed><TourHistory /></Authed>} />
      <Route path="/me" element={<Authed><Me /></Authed>} />
      <Route path="*" element={<Navigate to="/home" replace />} />
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
  if (loading) return <AuthSplash message="Opening your ledger…" />;
  if (!userId) {
    rememberReturnTo(location.pathname + location.search);
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

function NotConfigured() {
  return (
    <div className="app-frame safe-top px-6 pb-10 pt-14">
      <BrandLockup size="md" />
      <h1 className="mt-8 text-[22px] font-semibold text-ink">দেনা পাওনা isn’t configured</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
        Copy <code className="rounded-md bg-night-elev px-1.5 py-0.5 text-[13px] text-brand">.env.example</code> to{' '}
        <code className="rounded-md bg-night-elev px-1.5 py-0.5 text-[13px] text-brand">.env.local</code> and set{' '}
        <code className="rounded-md bg-night-elev px-1.5 py-0.5 text-[13px] text-brand">VITE_SUPABASE_URL</code> and{' '}
        <code className="rounded-md bg-night-elev px-1.5 py-0.5 text-[13px] text-brand">VITE_SUPABASE_ANON_KEY</code>. Never put the
        service role key in any <code className="rounded-md bg-night-elev px-1.5 py-0.5 text-[13px] text-brand">VITE_</code> variable.
      </p>
    </div>
  );
}
