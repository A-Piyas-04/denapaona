import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Map as MapIcon, Plus } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Badge, Button, Chip, Field, IconTile, Input, ListGroup, ListRow, Section, Segmented, Sheet } from '@/components/ui';
import { EmptyState, Loadable } from '@/components/States';
import { useMe } from '@/hooks/useAuth';
import { useMembers } from '@/hooks/useGroups';
import { useTrips } from '@/hooks/useTrips';
import { rpc } from '@/lib/rpc';
import { errorMessage } from '@/lib/errors';
import { shortDate } from '@/lib/format';
import type { EntryMode } from '@/lib/types';

/** Trips in this group, active and closed (§13.1). */
export function Trips() {
  const { id: groupId = '' } = useParams();
  const trips = useTrips(groupId);
  const [creating, setCreating] = useState(false);
  return (
    <AppShell title="Trips" back={`/groups/${groupId}`} action={
      <Button size="sm" onClick={() => setCreating(true)}><Plus size={17} aria-hidden /> New trip</Button>
    }>
      <Loadable query={trips}>
        {(list) => list.length === 0 ? (
          <EmptyState icon={MapIcon} title="No trips yet" body="A trip groups a burst of spending. Leaders record it on the spot.">
            <Button block onClick={() => setCreating(true)}>Start a trip</Button>
          </EmptyState>
        ) : (
          <>
            {(['active', 'closed'] as const).map((status) => {
              const rows = list.filter((t) => t.status === status);
              if (rows.length === 0) return null;
              return (
                <Section key={status} title={status === 'active' ? 'Active' : 'Closed'}>
                  <ListGroup>
                    {rows.map((t) => (
                      <ListRow key={t.id} to={`/trips/${t.id}`}
                               leading={<IconTile tone={status === 'active' ? 'brand' : 'slate'}><MapIcon size={20} /></IconTile>}
                               title={t.name}
                               subtitle={`${shortDate(t.started_on)}${t.ended_on ? ` to ${shortDate(t.ended_on)}` : ', ongoing'}`}
                               trailing={status === 'active' ? <Badge tone="brand">Active</Badge> : undefined} />
                    ))}
                  </ListGroup>
                </Section>
              );
            })}
          </>
        )}
      </Loadable>
      <CreateTripSheet groupId={groupId} open={creating} onClose={() => setCreating(false)} />
    </AppShell>
  );
}

/** Story D-01. */
function CreateTripSheet({ groupId, open, onClose }: { groupId: string; open: boolean; onClose: () => void }) {
  const me = useMe();
  const members = useMembers(groupId);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const all = (members.data ?? []).map((m) => m.user_id);
  const [name, setName] = useState('');
  const [roster, setRoster] = useState<string[] | null>(null);
  const [leaders, setLeaders] = useState<string[]>([]);
  const [mode, setMode] = useState<EntryMode>('leaders_only');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = roster ?? all;
  const nameOf = (id: string) => (id === me ? 'You' : members.data?.find((m) => m.user_id === id)?.profile.display_name ?? '?');
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const rosterSize = new Set([...chosen, ...leaders, me]).size;

  async function create() {
    setBusy(true); setError(null);
    try {
      const id = await rpc.createTrip({ groupId, name: name.trim(), memberIds: chosen, leaderIds: leaders, entryMode: mode });
      void qc.invalidateQueries({ queryKey: ['trips', groupId] });
      onClose();
      navigate(`/trips/${id}`);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <Sheet open={open} onClose={onClose} title="New trip"
           footer={
             <Button block size="lg" busy={busy} disabled={!name.trim() || rosterSize < 2} onClick={create}>
               {rosterSize < 2 ? 'Add at least two people' : 'Start trip'}
             </Button>
           }>
      <div className="space-y-6">
        <Field label="Trip name" htmlFor="trip-name" error={error}>
          <Input id="trip-name" autoFocus maxLength={60} placeholder="Sylhet Tour" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Who’s going?" hint="Anyone in the group can still be added later.">
          <div className="flex flex-wrap gap-2">
            {all.map((id) => (
              <Chip key={id} selected={chosen.includes(id) || id === me} disabled={id === me}
                    onClick={() => setRoster(toggle(chosen, id))}>{nameOf(id)}</Chip>
            ))}
          </div>
        </Field>
        <Field label="Co-leaders (you’re one already)"
               hint={leaders.length === 0 ? 'A second leader helps when you’re busy.'
                 : leaders.length >= 3 ? 'Leaders change balances without approval. Pick people you trust.' : undefined}>
          <div className="flex flex-wrap gap-2">
            {all.filter((id) => id !== me).map((id) => (
              <Chip key={id} selected={leaders.includes(id)} onClick={() => setLeaders(toggle(leaders, id))}>{nameOf(id)}</Chip>
            ))}
          </div>
        </Field>
        <Field label="Who can add expenses?">
          <Segmented label="Entry mode" value={mode} onChange={setMode}
                     options={[{ value: 'leaders_only', label: 'Leaders only' }, { value: 'open', label: 'Anyone on the trip' }]} />
        </Field>
      </div>
    </Sheet>
  );
}
