import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Chip } from './ui';

export interface Person { id: string; name: string }

/**
 * Feature 4.4: participant selection in one tap, not five.  Defaults to the
 * roster; "Everyone" toggles; per-person chips deselect.  The roster restricts
 * nothing — anyone in `others` can be added too.
 */
export function ParticipantPicker({ roster, others, selected, onChange }: {
  roster: Person[];
  others: Person[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [showOthers, setShowOthers] = useState(() => selected.some((id) => others.some((o) => o.id === id)));
  const set = new Set(selected);
  const everyone = roster.length > 0 && roster.every((p) => set.has(p.id));
  const toggle = (id: string) => onChange(set.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Chip selected={everyone} onClick={() => onChange(everyone ? [] : roster.map((p) => p.id))}>Everyone</Chip>
        {roster.map((p) => (
          <Chip key={p.id} selected={set.has(p.id)} onClick={() => toggle(p.id)}>{p.name}</Chip>
        ))}
      </div>
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
            <Plus size={16} aria-hidden /> Someone else
          </button>
        )
      )}
    </div>
  );
}
