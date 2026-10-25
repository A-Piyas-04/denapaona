import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/format';

type Tone = 'ok' | 'error' | 'info';
interface Toast { id: number; text: string; tone: Tone }

const ToastContext = createContext<(text: string, tone?: Tone) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Tone = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] mx-auto flex max-w-app flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => {
          const Icon = t.tone === 'error' ? AlertCircle : t.tone === 'info' ? Info : CheckCircle2;
          return (
            <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'}
                 className={cn('pointer-events-auto flex w-full animate-toast-in items-start gap-2.5 rounded-2xl px-4 py-3 text-[15px] font-medium text-white shadow-float',
                   t.tone === 'error' ? 'bg-owe' : 'bg-slate-900')}>
              <Icon size={19} className={cn('mt-0.5 shrink-0', t.tone === 'ok' && 'text-emerald-300')} aria-hidden />
              <span className="min-w-0 flex-1">{t.text}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
