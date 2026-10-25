import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Link2, Plus, Users } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Avatar, Button, Field, IconButton, Input, ListGroup, ListRow, Section, Sheet } from '@/components/ui';
import { EmptyState, ListSkeleton, Loadable } from '@/components/States';
import { Balance, Taka } from '@/components/Money';
import { useMyGroups, type MyGroup } from '@/hooks/useGroups';
import { rpc } from '@/lib/rpc';
import { errorMessage } from '@/lib/errors';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/format';

/** Story A-04: every group with one colour-coded net figure. */
export function Groups() {
  const groups = useMyGroups();
  const t = useT();
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  return (
    <AppShell title={t('groups.title')} action={
      <IconButton label={t('groups.new')} tone="brand" onClick={() => setCreating(true)} data-tour="new-group"><Plus size={22} /></IconButton>
    }>
      <Loadable query={groups} skeleton={<ListSkeleton rows={3} />}>
        {(list) => list.length === 0 ? (
          <EmptyState icon={Users} title={t('groups.empty.title')} body={t('groups.empty.body')}>
            <Button block onClick={() => setCreating(true)}>Create a group</Button>
            <Button block variant="ghost" onClick={() => navigate('/join')}>{t('groups.haveInvite')}</Button>
          </EmptyState>
        ) : (
          <>
            {list.length >= 2 && <Summary list={list} />}
            <Section title={t('groups.yours')}>
              <ListGroup>
                {list.map((g, i) => (
                  <ListRow key={g.id} to={`/groups/${g.id}`} data-tour={i === 0 ? 'group-row' : undefined}
                           leading={<Avatar name={g.name} seed={g.id} size={40} square />}
                           title={g.name}
                           subtitle={g.netPoisha > 0 ? "You're owed" : g.netPoisha < 0 ? 'You owe' : 'No balance'}
                           trailing={<Balance poisha={g.netPoisha} settledText={t('balance.allSettled')} className="text-[15px]" />} />
                ))}
              </ListGroup>
            </Section>
            <Link to="/join" className="inline-flex items-center justify-center gap-2 self-center rounded-xl px-3 py-2 text-[15px] font-semibold text-brand hover:bg-brand-soft/60">
              <Link2 size={18} aria-hidden /> {t('groups.haveInvite')}
            </Link>
          </>
        )}
      </Loadable>
      <CreateGroupSheet open={creating} onClose={() => setCreating(false)} />
    </AppShell>
  );
}

function Summary({ list }: { list: MyGroup[] }) {
  const t = useT();
  const owed = list.reduce((s, g) => s + Math.max(0, g.netPoisha), 0);
  const owe = list.reduce((s, g) => s + Math.max(0, -g.netPoisha), 0);
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-3xl border border-slate-200/80 bg-white">
      <div className="px-5 py-4">
        <p className="text-[14px] font-medium text-slate-500">{t('balance.youreOwed')}</p>
        <Taka poisha={owed} className={cn('mt-1 block font-display text-[24px] font-semibold', owed ? 'text-owed' : 'text-slate-400')} />
      </div>
      <div className="border-l border-slate-100 px-5 py-4">
        <p className="text-[14px] font-medium text-slate-500">{t('balance.youOwe')}</p>
        <Taka poisha={owe} className={cn('mt-1 block font-display text-[24px] font-semibold', owe ? 'text-owe' : 'text-slate-400')} />
      </div>
    </div>
  );
}

/** Story A-02. */
function CreateGroupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const trimmed = name.trim();

  async function create() {
    if (!trimmed || busy) return;
    setBusy(true); setError(null);
    try {
      const id = await rpc.createGroup(trimmed);
      void qc.invalidateQueries({ queryKey: ['groups'] });
      setName('');
      onClose();
      navigate(`/groups/${id}?new=1`);
    } catch (e) {
      setError(`Couldn’t create the group. ${errorMessage(e)}`); // name preserved (A-02#5)
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="New group">
      <form onSubmit={(e) => { e.preventDefault(); void create(); }} className="space-y-5">
        <Field label="Group name" htmlFor="gname"
               hint={name.length >= 50 ? `${name.length}/60` : 'You can invite people next.'}
               error={error}>
          <Input id="gname" autoFocus maxLength={60} placeholder="Hall 3 Friends" value={name}
                 onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button type="submit" block size="lg" busy={busy} disabled={!trimmed}>Create</Button>
      </form>
    </Sheet>
  );
}
