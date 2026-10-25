import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './hooks/useAuth';
import { I18nProvider } from './lib/i18n';
import { ToastProvider } from './components/Toast';
import { TourProvider } from './tour/TourProvider';
import { App } from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Refetch on focus is the Realtime fallback (story C-04#4) and keeps
      // settle suggestions fresh (F-01#3).
      refetchOnWindowFocus: true,
      staleTime: 5_000,
      retry: (count, err) => count < 2 && (err as { code?: string })?.code === 'NETWORK',
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <I18nProvider>
          <AuthProvider>
            <ToastProvider>
              <TourProvider>
                <App />
              </TourProvider>
            </ToastProvider>
          </AuthProvider>
        </I18nProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
