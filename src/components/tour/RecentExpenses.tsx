import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ManageExpense } from '@/hooks/useTours';
import { formatTourTaka } from '@/lib/tourMoney';
import { tourErrorMessage, tourRpc } from '@/lib/tourRpc';

export function RecentExpenses({
  tourId,
  expenses,
}: {
  tourId: string;
  expenses: ManageExpense[];
}) {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(expenseId: string, title: string) {
    if (!window.confirm(`Delete "${title}"? This recalculates everyone's balances.`)) return;
    setBusyId(expenseId);
    setError(null);
    try {
      await tourRpc.deleteExpense(tourId, expenseId);
      void qc.invalidateQueries({ queryKey: ['tour', tourId] });
    } catch (err) {
      setError(tourErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-ink">Recent expenses</h2>
      {error && <p className="text-sm text-owe">{error}</p>}
      {expenses.length === 0 ? (
        <p className="rounded-xl border border-dashed border-night-line p-3 text-sm text-ink-soft">
          No expenses yet.
        </p>
      ) : (
        <ul className="grid gap-2">
          {expenses.map((e) => (
            <li key={e.id} className="rounded-2xl border border-night-line/70 bg-paper p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{e.title}</p>
                  <p className="text-xs text-ink-soft">
                    {e.splitMode === 'individual'
                      ? `${e.participantCount} individual bills`
                      : `${e.participantCount} shared equally`}{' '}
                    · paid by {e.payerSummary} · {new Date(e.createdAt).toLocaleString()}
                  </p>
                  {e.splitMode === 'individual' && e.bills.length > 0 && (
                    <ul className="mt-2 grid gap-0.5 text-xs text-ink-soft">
                      {e.bills.map((b) => (
                        <li key={b.userId} className="flex justify-between gap-3">
                          <span className="min-w-0 break-words">{b.name}</span>
                          <span className="shrink-0 tabular-nums">{formatTourTaka(b.paisa)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-semibold tabular-nums text-ink">
                    {formatTourTaka(e.amountPaisa)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void remove(e.id, e.title)}
                    disabled={busyId === e.id}
                    className="text-xs font-semibold text-owe disabled:opacity-50"
                  >
                    {busyId === e.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
