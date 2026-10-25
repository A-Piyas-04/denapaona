import { Check, Star, X } from 'lucide-react';
import { Badge, InfoSheet } from './ui';

/** Shown beside leaders' names throughout the trip UI (§13.3, story D-12). */
export function LeaderBadge() {
  return <Badge tone="amber"><Star size={11} className="fill-current" aria-hidden /> Leader</Badge>;
}

const CAN = ['Add expenses for anyone on the trip', 'Cancel and re-enter a wrong expense', 'Record that someone paid back', 'Add or remove leaders'];
const CANNOT = ['Move your debt to someone else', 'Touch anything outside this trip', 'Edit or erase history', 'Act once the trip is closed'];

/** D-12#1: a one-tap explainer of what leaders can and cannot do. */
export function LeaderExplainer() {
  return (
    <InfoSheet title="What trip leaders can do" label="What can leaders do?">
      <p>On a trip, trusted leaders record spending on the spot. Every action shows who did it.</p>
      <ul className="space-y-2">
        {CAN.map((s) => <li key={s} className="flex gap-2"><Check size={18} className="mt-0.5 shrink-0 text-owed" aria-hidden />{s}</li>)}
      </ul>
      <p className="pt-1 font-semibold text-slate-900">They can never</p>
      <ul className="space-y-2">
        {CANNOT.map((s) => <li key={s} className="flex gap-2"><X size={18} className="mt-0.5 shrink-0 text-owe" aria-hidden />{s}</li>)}
      </ul>
    </InfoSheet>
  );
}
