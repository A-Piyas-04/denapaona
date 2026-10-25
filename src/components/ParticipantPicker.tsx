import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { Chip } from './ui';
import { LeaderBadge } from './LeaderBadge';

export interface Person { id: string; name: string; isLeader?: boolean }

/**
 * Feature 4.4: participant selection in one tap, not five.  Defaults to the
 * roster; "Everyone" toggles; per-person chips deselect; saved presets and the
 * last three sets used appear as chips above.  The roster restricts nothing —
 * any group member can be added (story D-03#2).
 */
export function ParticipantPicker({ roster, others, selected, onChange, presets = [], recent = [] }: {
  roster: Person[];
  others: Person[];
  selected: string[];
  onChange: (ids: string[]) => void;
  presets?: { id: string; label: string; userIds: string[] }[];
  recent?: string[][];
}) {
  const [showOthers, setShowOthers] = useState(() => selected.some((id) => others.some((o) => o.id === id)));
  const set = new Set(selected);
  const everyone = roster.length > 0 && roster.every((p) => set.has(p.id));
  const all = [...roster, ...others];
  const nameOf = (id: string) => all.find((p) => p.id === id)?.name ?? '?';
  const toggle = (id: string) => onChange(set.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const same = (ids: string[]) => ids.length === set.size && ids.every((id) => set.has(id));
  const known = new Set(all.map((p) => p.id));
  const shortcuts = presets.length > 0 || recent.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Chip selected={everyone} onClick={() => onChange(everyone ? [] : roster.map((p) => p.id))}>
          {everyone && <Check size={16} aria-hidden />}Everyone
        </Chip>
        {roster.map((p) => (
          <Chip key={p.id} selected={set.has(p.id)} onClick={() => toggle(p.id)}>
            {p.name}{p.isLeader && <span className="sr-only"> (leader)</span>}
          </Chip>
        ))}
      </div>
      {shortcuts && (
        <div>
          <p className="mb-2 text-[13px] font-medium text-slate-500">Saved and recent</p>
          <div className="flex flex-wrap gap-2">
            {presets.slice(0, 3).map((p) => {
              const ids = p.userIds.filter((id) => known.has(id));
              return <Chip key={p.id} selected={same(ids)} onClick={() => onChange(ids)}>{p.label}</Chip>;
            })}
            {recent.map((ids) => (
              <Chip key={ids.join()} selected={same(ids)} onClick={() => onChange(ids)} className="max-w-full">
                <span className="truncate">{ids.map(nameOf).join(', ')}</span>
              </Chip>
            ))}
          </div>
        </div>
      )}
      {others.length > 0 && (
        showOthers ? (
          <div>
            <p className="mb-2 text-[13px] font-medium text-slate-500">Also in the group</p>
            <div className="flex flex-wrap gap-2">
              {others.map((p) => (
                <Chip key={p.id} selected={set.has(p.id)} onClick={() => toggle(p.id)}>{p.name}</Chip>
              ))}
            </div>
          </div>
        ) : (
          <button type="button" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand" onClick={() => setShowOthers(true)}>
            <Plus size={16} aria-hidden /> Someone not on the trip
          </button>
        )
      )}
    </div>
  );
}

export function PersonLine({ name, leader }: { name: string; leader?: boolean }) {
  return <span className="inline-flex items-center gap-1.5">{name}{leader && <LeaderBadge />}</span>;
}
