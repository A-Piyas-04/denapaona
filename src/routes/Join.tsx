import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2 } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Avatar, Button, Field, Input } from '@/components/ui';
import { ErrorState, HeroSkeleton } from '@/components/States';
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
      {preview.isLoading ? <HeroSkeleton />
        : preview.error ? (
          <>
            <ErrorState error={preview.error} />
            <ManualCodeForm />
          </>
        ) : preview.data && !preview.data.already_member ? (
          <div className="flex flex-col items-center rounded-3xl border border-slate-200/80 bg-white px-6 py-8 text-center">
            <Avatar name={preview.data.group_name} seed={preview.data.group_id} size={64} square />
            <h2 className="mt-4 text-[22px] font-semibold text-slate-900">Join {preview.data.group_name}?</h2>
            <p className="mt-1 text-[15px] text-slate-500">{preview.data.member_count} member{preview.data.member_count === 1 ? '' : 's'} so far</p>
            {error && <p className="mt-3 text-[14px] text-owe" role="alert">{error}</p>}
            <Button block size="lg" className="mt-6" busy={busy} onClick={async () => {
              setBusy(true); setError(null);
              try {
                const id = await rpc.joinGroup(code);
                void qc.invalidateQueries({ queryKey: ['groups'] });
                navigate(`/groups/${id}`, { replace: true });
              } catch (e) { setError(errorMessage(e)); setBusy(false); }
            }}>Join</Button>
          </div>
        ) : null}
    </AppShell>
  );
}

function ManualCode() {
  return (
    <AppShell title="Join a group" back="/groups">
      <div className="flex flex-col items-center px-4 pt-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand" aria-hidden><Link2 size={26} /></span>
        <p className="mt-4 font-display text-[18px] font-semibold text-slate-900">Got an invite?</p>
        <p className="mt-1 text-[15px] text-slate-500">Paste the link someone sent you.</p>
      </div>
      <ManualCodeForm />
    </AppShell>
  );
}

function ManualCodeForm() {
  const [value, setValue] = useState('');
  const [go, setGo] = useState<string | null>(null);
  if (go) return <Navigate to={`/join/${go}`} />;
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); const c = extractCode(value); if (c) setGo(c); }}>
      <Field label="Invite link or code" htmlFor="invite-code" hint="The whole link, or just the code at the end.">
        <Input id="invite-code" name="invite-code" autoFocus spellCheck={false} autoCapitalize="off" value={value}
               onChange={(e) => setValue(e.target.value)} placeholder="https://…/join/Ab3…" />
      </Field>
      <Button type="submit" block size="lg" disabled={!extractCode(value)}>Continue</Button>
    </form>
  );
}
