import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { Button, Card, Field, Input, Sheet } from '@/components/ui';
import { EmptyState, Loadable } from '@/components/States';
import { Balance } from '@/components/Money';
import { useMyGroups } from '@/hooks/useGroups';
import { rpc } from '@/lib/rpc';
import { errorMessage } from '@/lib/errors';
import { useT } from '@/lib/i18n';

/** Story A-04: every group with one colour-coded net figure. */
export function Groups() {
  const groups = useMyGroups();
  const t = useT();
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  return (
    <AppShell title={t('groups.title')} action={
      <Button size="sm" onClick={() => setCreating(true)}>+ {t('groups.new')}</Button>
    }>
      <Loadable query={groups}>
        {(list) => list.length === 0 ? (
          <EmptyState title={t('groups.empty.title')} body={t('groups.empty.body')}>
            <Button onClick={() => setCreating(true)}>Create a group</Button>
            <Button variant="outline" onClick={() => navigate('/join')}>{t('groups.haveInvite')}</Button>
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {list.map((g) => (
              <li key={g.id}>
                <Link to={`/groups/${g.id}`}>
                  <Card className="flex items-center justify-between hover:border-slate-300">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{g.name}</p>
                      <p className="text-xs text-slate-500">
                        {g.netPoisha > 0 ? "you're owed" : g.netPoisha < 0 ? 'you owe' : ' '}
                      </p>
                    </div>
                    <Balance poisha={g.netPoisha} settledText={t('balance.allSettled')} />
                  </Card>
                </Link>
              </li>
            ))}
            <li className="pt-2 text-center">
              <Link to="/join" className="text-sm font-medium text-brand">{t('groups.haveInvite')}</Link>
            </li>
          </ul>
        )}
      </Loadable>
      <CreateGroupSheet open={creating} onClose={() => setCreating(false)} />
    </AppShell>
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
      <form onSubmit={(e) => { e.preventDefault(); void create(); }} className="space-y-4">
        <Field label="Group name" htmlFor="gname"
               hint={!trimmed ? 'Give your group a name.' : name.length >= 50 ? `${name.length}/60` : undefined}
               error={error}>
          <Input id="gname" autoFocus maxLength={60} placeholder="Hall 3 Friends" value={name}
                 onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button type="submit" block busy={busy} disabled={!trimmed}>Create</Button>
      </form>
    </Sheet>
  );
}
