import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { TourMember } from '@/lib/tourRpc';
import { tourErrorMessage, tourRpc } from '@/lib/tourRpc';

export function LeaderControls({
  tourId,
  members,
}: {
  tourId: string;
  members: TourMember[];
}) {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(userId: string, makeLeader: boolean) {
    setBusyId(userId);
    setError(null);
    try {
      await tourRpc.setLeaderRole(tourId, userId, makeLeader);
      void qc.invalidateQueries({ queryKey: ['tour', tourId] });
    } catch (err) {
      setError(tourErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-2 rounded-2xl border border-night-line/70 bg-paper p-4 shadow-soft">
      <h2 className="text-base font-semibold text-ink">Leaders</h2>
      <p className="text-xs text-ink-soft">
        Only you (the tour creator) can promote members to secondary leader or demote them.
      </p>
      {error && <p className="text-sm text-owe">{error}</p>}
      <ul className="divide-y divide-night-line/60">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0 break-words text-ink">
              {m.name}{' '}
              <span className="text-xs capitalize text-ink-soft">· {m.role}</span>
            </span>
            {m.role === 'owner' ? (
              <span className="shrink-0 text-xs text-ink-soft">Creator</span>
            ) : m.role === 'leader' ? (
              <button
                type="button"
                onClick={() => void toggle(m.userId, false)}
                disabled={busyId === m.userId}
                className="shrink-0 rounded-full border border-night-line px-3 py-1 text-xs font-semibold text-ink disabled:opacity-50"
              >
                Demote
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void toggle(m.userId, true)}
                disabled={busyId === m.userId}
                className="shrink-0 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-brand-fg disabled:opacity-50"
              >
                Make leader
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
