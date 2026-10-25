import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { Button, Card, Field, Input } from '@/components/ui';
import { ErrorState, ListSkeleton } from '@/components/States';
import { rpc } from '@/lib/rpc';
import { errorMessage } from '@/lib/errors';

/** Strip a pasted URL down to its code (A-03#6: links mangled by chat apps). */
function extractCode(raw: string): string {
  const s = raw.trim();
  const m = /\/join\/([A-Za-z0-9_-]+)/.exec(s);
  return m ? m[1]! : s.replace(/[^A-Za-z0-9_-]/g, '');
}

/** Story A-03 — invite landing.  Invalid codes reveal nothing about any group. */
export function Join() {
  const { code } = useParams();
  if (!code) return <ManualCode />;
  return <JoinPrompt code={code} />;
}

function JoinPrompt({ code }: { code: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const preview = useQuery({ queryKey: ['invite', code], queryFn: () => rpc.previewInvite(code), retry: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A-03#2: already a member — straight to the dashboard, no prompt.
  useEffect(() => {
    if (preview.data?.already_member) navigate(`/groups/${preview.data.group_id}`, { replace: true });
  }, [preview.data, navigate]);

  return (
    <AppShell title="Join a group" back="/groups">
      {preview.isLoading ? <ListSkeleton rows={1} />
        : preview.error ? (
          <div className="space-y-4">
            <ErrorState error={preview.error} />
            <ManualCodeForm />
          </div>
        ) : preview.data && !preview.data.already_member ? (
          <Card className="space-y-4 text-center">
            <p className="text-lg text-slate-700">Join <strong className="text-slate-900">{preview.data.group_name}</strong>?</p>
            <p className="text-sm text-slate-500">{preview.data.member_count} member{preview.data.member_count === 1 ? '' : 's'} so far</p>
            {error && <p className="text-sm text-owe">{error}</p>}
            <Button block size="lg" busy={busy} onClick={async () => {
              setBusy(true); setError(null);
              try {
                const id = await rpc.joinGroup(code);
                void qc.invalidateQueries({ queryKey: ['groups'] });
                navigate(`/groups/${id}`, { replace: true });
              } catch (e) { setError(errorMessage(e)); setBusy(false); }
            }}>Join</Button>
          </Card>
        ) : null}
    </AppShell>
  );
}

function ManualCode() {
  return <AppShell title="Join a group" back="/groups"><ManualCodeForm /></AppShell>;
}

function ManualCodeForm() {
  const [value, setValue] = useState('');
  const [go, setGo] = useState<string | null>(null);
  if (go) return <Navigate to={`/join/${go}`} />;
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const c = extractCode(value); if (c) setGo(c); }}>
      <Field label="Invite link or code" htmlFor="invite-code" hint="Paste the whole link, or just the code at the end of it.">
        <Input id="invite-code" autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://…/join/Ab3…" />
      </Field>
      <Button type="submit" block disabled={!extractCode(value)}>Continue</Button>
    </form>
  );
}
