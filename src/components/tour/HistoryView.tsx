import { useState } from 'react';
import { Button } from '@/components/ui';
import type { HistoryEvent, HistoryKind } from '@/lib/tourHistory';
import { cn } from '@/lib/format';

const KIND_LABEL: Record<HistoryKind, string> = {
  tour_created: 'Tour created',
  member_joined: 'Member joined',
  expense_added: 'Expense recorded',
};

const KIND_DOT: Record<HistoryKind, string> = {
  tour_created: 'bg-brand',
  member_joined: 'bg-sky-500',
  expense_added: 'bg-pending',
};

export function HistoryView({ events }: { events: HistoryEvent[] }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="space-y-4">
      <Button type="button" block size="lg" onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide activity history' : `Show activity history (${events.length})`}
      </Button>

      {open &&
        (events.length === 0 ? (
          <p className="rounded-xl border border-dashed border-night-line p-4 text-sm text-ink-soft">
            Nothing has happened in this tour yet.
          </p>
        ) : (
          <ol className="relative space-y-3 border-l border-night-line pl-5">
            {events.map((e, i) => (
              <li key={`${e.at}-${i}`} className="relative">
                <span
                  className={cn(
                    'absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full',
                    KIND_DOT[e.kind],
                  )}
                  aria-hidden
                />
                <div className="rounded-2xl border border-night-line/70 bg-paper p-3 shadow-soft">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                      {KIND_LABEL[e.kind]}
                    </span>
                    <time className="text-xs tabular-nums text-ink-soft">
                      {new Date(e.at).toLocaleString()}
                    </time>
                  </div>
                  <p className="mt-1 font-medium text-ink">{e.summary}</p>
                  {e.detail && <p className="text-sm text-ink-soft">{e.detail}</p>}
                  <p className="mt-1 text-xs text-ink-soft">by {e.actor}</p>
                </div>
              </li>
            ))}
          </ol>
        ))}
    </div>
  );
}
