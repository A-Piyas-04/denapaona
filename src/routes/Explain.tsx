import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ListOrdered, Map as MapIcon } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { DerivationView } from '@/components/DerivationView';
import { Banner, Button, Field, Input, Section, Segmented, Sheet, StatHero, Textarea } from '@/components/ui';
import { EmptyState, ErrorState, HeroSkeleton, ListSkeleton } from '@/components/States';
import { useToast } from '@/components/Toast';
import { useMe } from '@/hooks/useAuth';
import { useNames } from '@/hooks/useGroups';
import { useExplain } from '@/hooks/useExplain';
import { useTrip } from '@/hooks/useTrips';
import { rpc } from '@/lib/rpc';
import { errorMessage } from '@/lib/errors';
import { formatTaka, isPartialTakaInput, parseTakaToPoisha } from '@/lib/money';

/**
 * "Why do I owe this?" — stories E-01, E-02, E-03, E-04, plus the actions that
 * follow naturally from reading a balance: settle all (F-05) and propose a
 * correction (C-07).
 */
export function Explain() {
  const { groupId = '', otherId = '' } = useParams();
  const [params] = useSearchParams();
  const tripId = params.get('trip');
  const me = useMe();
  const { name } = useNames(groupId);
  const trip = useTrip(tripId ?? '');
  const explain = useExplain(groupId, otherId, tripId);
  const other = name(otherId);
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [correcting, setCorrecting] = useState(false);

  const final = explain.data?.expected ?? 0; // + they owe me

  async function settleAll() {
    setBusy(true);
    try {
      const debtor = final < 0 ? me : otherId;
      const creditor = final < 0 ? otherId : me;
      const id = await rpc.proposeSettlement({ groupId, debtor, creditor, amount: Math.abs(final) });
      toast(final < 0 ? `Sent. ${other} confirms they got it.` : `Sent. ${other} confirms they paid.`);
      navigate(`/proposals/${id}`);
    } catch (e) { toast(errorMessage(e), 'error'); }
    finally { setBusy(false); }
  }

  return (
    <AppShell title={`You and ${other}`} back>
      {tripId && (
        <Banner icon={MapIcon} to={`/explain/${groupId}/${otherId}`} action={<span className="text-[14px] font-semibold">See all</span>}>
          Showing {trip.data?.trip.name ?? 'one trip'} only
        </Banner>
      )}

      {explain.isLoading ? <><HeroSkeleton /><ListSkeleton rows={4} /></> : explain.error ? <ErrorState error={explain.error} onRetry={() => explain.refetch()} /> : explain.data && (
        <>
          {!explain.data.consistent && (
            // Invariant I6, made visible.  This can only mean an engine bug — never hidden (E-01#2).
            <div className="flex items-start gap-3 rounded-2xl bg-owe p-4 text-[15px] text-white" role="alert">
              <AlertTriangle size={20} className="mt-0.5 shrink-0" aria-hidden />
              <p><strong>Something’s wrong.</strong> The steps add up to {formatTaka(explain.data.final)}, but the
                balance says {formatTaka(explain.data.expected)}. Don’t settle on this figure. Report it to whoever runs this app.</p>
            </div>
          )}
          <StatHero
            label={final === 0 ? 'Right now' : final > 0 ? `${other} owes you` : `You owe ${other}`}
            tone={final > 0 ? 'owed' : final < 0 ? 'owe' : 'neutral'}
            value={final === 0 ? <span className="text-slate-400">Square</span>
              : <span className={final > 0 ? 'text-owed' : 'text-owe'}>{formatTaka(Math.abs(final))}</span>}
            sub={!tripId ? (
              <div className="mt-1 flex flex-wrap gap-2">
                {final !== 0 && (
                  <Button size="sm" busy={busy} onClick={settleAll}>
                    {final < 0 ? `Settle ${formatTaka(-final)}` : `${other} paid me`}
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => setCorrecting(true)}>Propose a correction</Button>
              </div>
            ) : undefined}
          />
          <Section title="How we got here">
            <p className="-mt-1 mb-3 px-1 text-[13px] text-slate-500">Every step that produced this figure, oldest first.</p>
            {explain.data.rows.length === 0 ? (
              <EmptyState icon={ListOrdered} title={tripId ? 'Nothing on this trip between you two' : 'Nothing between you two yet'} />
            ) : (
              <DerivationView rows={explain.data.rows} groupId={groupId} otherName={other} />
            )}
          </Section>
          <CorrectionSheet open={correcting} onClose={() => setCorrecting(false)} groupId={groupId}
                           me={me} otherId={otherId} other={other} current={final} />
        </>
      )}
    </AppShell>
  );
}

/**
 * Story C-07.  The other person must approve; nothing changes until they do,
 * and the change is a new compensating entry — never an edit.
 */
function CorrectionSheet({ open, onClose, groupId, me, otherId, other, current }: {
  open: boolean; onClose: () => void; groupId: string; me: string; otherId: string; other: string; current: number;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const [dir, setDir] = useState<'they' | 'me'>(current < 0 ? 'me' : 'they');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const target = parseTakaToPoisha(value);
  const signedTarget = target === null ? null : dir === 'they' ? target : -target;
  const delta = signedTarget === null ? 0 : signedTarget - current;

  async function send() {
    if (delta === 0 || !reason.trim()) return;
    // Express the change as one agreed amendment.  Prefer a "decrease" when it
    // reduces an existing debt (the server re-validates it at commit), and an
    // "increase" in the right direction otherwise.
    const args =
      delta < 0 && current > 0 && -delta <= current ? { fromUser: otherId, toUser: me, amount: -delta, direction: 'decrease' as const }
      : delta > 0 && current < 0 && delta <= -current ? { fromUser: me, toUser: otherId, amount: delta, direction: 'decrease' as const }
      : delta > 0 ? { fromUser: otherId, toUser: me, amount: delta, direction: 'increase' as const }
      : { fromUser: me, toUser: otherId, amount: -delta, direction: 'increase' as const };
    setBusy(true);
    try {
      const id = await rpc.proposeAmendment({ groupId, ...args, note: reason.trim() });
      toast(`Sent to ${other} for approval`);
      navigate(`/proposals/${id}`);
    } catch (e) { toast(errorMessage(e), 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Propose a correction"
           footer={<Button block size="lg" busy={busy} disabled={target === null || delta === 0 || !reason.trim()} onClick={send}>Send for approval</Button>}>
      <div className="space-y-5">
        <p className="text-[15px] text-slate-600">
          Now: {current === 0 ? 'you’re square' : current > 0 ? `${other} owes you ${formatTaka(current)}` : `you owe ${other} ${formatTaka(-current)}`}.
          {' '}{other} must agree first.
        </p>
        <Segmented label="Direction" value={dir} onChange={setDir}
                   options={[{ value: 'they', label: `${other} owes me` }, { value: 'me', label: `I owe ${other}` }]} />
        <Field label="It should be (৳)" htmlFor="corr-amount">
          <Input id="corr-amount" inputMode="decimal" value={value} onChange={(e) => isPartialTakaInput(e.target.value) && setValue(e.target.value)} />
        </Field>
        <Field label="Why?" htmlFor="corr-reason">
          <Textarea id="corr-reason" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="We agreed the tea was my treat" />
        </Field>
      </div>
    </Sheet>
  );
}
