import { useState } from 'react';
import { Badge, Button, Sheet } from './ui';

/** Shown beside leaders' names throughout the trip UI (§13.3, story D-12). */
export function LeaderBadge() {
  return <Badge tone="amber" className="gap-1">★ Leader</Badge>;
}

/** D-12#1: a one-tap explainer of what leaders can and cannot do. */
export function LeaderExplainer() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="text-sm font-medium text-brand hover:underline" onClick={() => setOpen(true)}>
        What can leaders do?
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Trip leaders">
        <div className="space-y-4 text-[15px] text-slate-700">
          <p>
            Everywhere else in HishebNama, <strong>nothing changes your balance without your agreement</strong>.
            Inside an active trip, the group hands that job to two or three trusted leaders so things get recorded
            on the spot.
          </p>
          <div>
            <p className="mb-1 font-semibold text-slate-900">Leaders can, immediately:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>add expenses for anyone on the trip</li>
              <li>cancel and re-enter a wrong expense (with a reason)</li>
              <li>record that someone paid someone back</li>
              <li>add or remove other leaders</li>
            </ul>
          </div>
          <div>
            <p className="mb-1 font-semibold text-slate-900">Leaders can never:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>transfer your debt to someone else — that always needs your approval</li>
              <li>touch anything from outside this trip</li>
              <li>edit or erase history — every action is labelled with who did it, and stays visible</li>
              <li>do anything once the trip is closed</li>
            </ul>
          </div>
          <p>You’re told whenever your balance changes, every figure has a “Why?”, and you can flag anything that looks wrong.</p>
          <Button block variant="secondary" onClick={() => setOpen(false)}>Got it</Button>
        </div>
      </Sheet>
    </>
  );
}
