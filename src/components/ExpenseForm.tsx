import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Users, Wallet } from 'lucide-react';
import { Avatar, Button, Field, IconTile, Input, ListGroup, ListRow, Segmented, Sheet, StickyFooter } from './ui';
import { ParticipantPicker, type Person } from './ParticipantPicker';
import { Taka } from './Money';
import { useToast } from './Toast';
import { useDraft } from '@/hooks/useBrowser';
import { rpc, newClientToken } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';
import { errorMessage, toAppError } from '@/lib/errors';
import {
  formatTaka, isPartialTakaInput, parseTakaToPoisha, poishaToInput, remainderRecipients, SANITY_BOUND_POISHA,
  splitEvenly, splitRemainder, sum,
} from '@/lib/money';
import { timeAgo, cn } from '@/lib/format';
import type { Expense, TripPreset } from '@/lib/types';

interface Draft {
  amount: string;
  description: string;
  payerId: string;
  participants: string[];
  mode: 'equal' | 'unequal';
  custom: Record<string, string>;
  /** Survives a refresh, so a retry after reload still can't double-create. */
  clientToken: string;
}

export interface ExpenseFormProps {
  groupId: string;
  me: string;
  roster: Person[];        // default participants (trip roster, or all members)
  others: Person[];        // other group members, addable on demand
  tripId?: string;
  presets?: TripPreset[];
  recentSets?: string[][];
  runningTotal?: number;   // Feature 4.4: trip total visible while entering
  prefill?: Expense | null;
  onSaved: (expenseId: string) => void;
}

/**
 * Add-expense form, equal or itemised (stories B-01, B-02, B-03, D-02, D-03).
 *
 * Built for the 10-second target (Feature 4.4): keypad focused on open, payer
 * defaults to you, participants default to the whole roster, one tap to save.
 * Everything checked here is re-checked by add_expense — the client indicator
 * is a convenience only (B-02#5).
 */
export function ExpenseForm(props: ExpenseFormProps) {
  const { groupId, me, roster, others, tripId, presets = [], recentSets = [], runningTotal, prefill, onSaved } = props;
  const qc = useQueryClient();
  const toast = useToast();
  const amountRef = useRef<HTMLInputElement>(null);

  const initial: Draft = {
    amount: '', description: '', payerId: me, participants: roster.map((p) => p.id),
    mode: 'equal', custom: {}, clientToken: newClientToken(),
  };
  const [draft, setDraft, clearDraft] = useDraft<Draft>(`hn.draft.expense.${groupId}.${tripId ?? 'group'}`, initial);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  // "Void and re-enter" (D-07): start from the voided expense's values.
  useEffect(() => {
    if (!prefill) return;
    const shares = prefill.expense_shares ?? [];
    const positive = shares.filter((s) => s.share_poisha > 0);
    const even = splitEvenly(prefill.total_poisha, positive.map((s) => s.user_id));
    const isEven = positive.every((s) => even.get(s.user_id) === s.share_poisha);
    setDraft({
      amount: poishaToInput(prefill.total_poisha),
      description: prefill.description,
      payerId: prefill.payer_id,
      participants: positive.map((s) => s.user_id),
      mode: isEven ? 'equal' : 'unequal',
      custom: Object.fromEntries(positive.map((s) => [s.user_id, poishaToInput(s.share_poisha)])),
      clientToken: newClientToken(),
    });
  }, [prefill, setDraft]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { kind: 'large' } | { kind: 'duplicate'; text: string }>(null);
  const [offerPreset, setOfferPreset] = useState<string[] | null>(null);
  const [sheet, setSheet] = useState<null | 'payer' | 'split'>(null);

  const people = useMemo(() => [...roster, ...others], [roster, others]);
  const nameOf = (id: string) => (id === me ? 'You' : people.find((p) => p.id === id)?.name ?? '?');

  const total = parseTakaToPoisha(draft.amount);
  const shares: Map<string, number> = useMemo(() => {
    if (!total) return new Map();
    if (draft.mode === 'equal') return splitEvenly(total, draft.participants);
    return new Map(draft.participants.map((id) => [id, parseTakaToPoisha(draft.custom[id] ?? '') ?? 0]));
  }, [total, draft.mode, draft.participants, draft.custom]);

  const assigned = sum(shares.values());
  const extraPoisha = total && draft.mode === 'equal' ? remainderRecipients(total, draft.participants) : new Set<string>();
  const othersCharged = [...shares].filter(([id, v]) => id !== draft.payerId && v > 0).length;

  const splitProblem =
    draft.participants.length === 0 ? 'Pick who shared this.'
    : draft.mode === 'unequal' && total && assigned < total ? `${formatTaka(total - assigned)} still unassigned.`
    : draft.mode === 'unequal' && total && assigned > total ? `${formatTaka(assigned - total)} over the total.`
    : total && othersCharged === 0 ? 'An expense needs at least one other person.'
    : null;
  const problem =
    !total ? 'Enter an amount.'
    : draft.description.trim() === '' ? 'Add a description.'
    : splitProblem;

  async function save(skip: { large?: boolean; duplicate?: boolean } = {}) {
    if (problem || !total) return;
    setError(null);
    if (!skip.large && total > SANITY_BOUND_POISHA) { setConfirm({ kind: 'large' }); return; }
    setBusy(true);
    try {
      if (!skip.duplicate) {
        // B-03#3: warn, never block.
        const similar = await rpc.recentSimilarExpense(groupId, draft.payerId, total).catch(() => null);
        if (similar) {
          setBusy(false);
          setConfirm({
            kind: 'duplicate',
            text: `“${similar.description}” for the same amount was added by ${similar.created_by_name} ${timeAgo(similar.created_at)}.`,
          });
          return;
        }
      }
      const id = await rpc.addExpense({
        groupId, payerId: draft.payerId, total, description: draft.description.trim(), tripId,
        shares: [...shares].map(([user_id, share]) => ({ user_id, share })),
        clientToken: draft.clientToken,
      });
      toast(`Expense saved: ${formatTaka(total)}`);
      clearDraft();
      void qc.invalidateQueries({ predicate: (q) => q.queryKey.includes(groupId) || q.queryKey[0] === 'groups' || q.queryKey[0] === 'tripNets' });
      if (tripId && maybeOfferPreset(tripId, draft.participants, roster.length, presets)) {
        setOfferPreset(draft.participants);
        pendingSaved.current = id;
        return;
      }
      onSaved(id);
    } catch (e) {
      const err = toAppError(e);
      // B-01#10: someone left mid-entry — reload members so the form is current.
      if (err.code === 'SHARE_USER_NOT_A_MEMBER') void qc.invalidateQueries({ queryKey: ['members', groupId] });
      setError(err.message); // form state preserved entirely (B-01#7)
    } finally {
      setBusy(false);
    }
  }
  const pendingSaved = useRef<string | null>(null);

  const everyone = roster.length > 0 && roster.every((p) => draft.participants.includes(p.id)) && draft.participants.length === roster.length;
  const splitWho = draft.participants.length === 0 ? 'Nobody yet'
    : everyone ? (roster.length === 2 ? `You and ${nameOf(roster.find((p) => p.id !== me)?.id ?? '')}` : `Everyone (${roster.length})`)
    : draft.participants.length <= 3 ? draft.participants.map(nameOf).join(', ')
    : `${draft.participants.length} people`;
  const each = total && draft.mode === 'equal' && draft.participants.length > 0
    ? Math.floor(total / draft.participants.length) : null;
  const splitSummary = draft.mode === 'equal'
    ? `Equally${each !== null ? `, ${formatTaka(each)} each` : ''}`
    : 'Unequally';
  const payerOptions = people.filter((p) => p.id === me || roster.some((r) => r.id === p.id) || p.id === draft.payerId)
    .sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : 0));

  return (
    <form className="flex flex-1 flex-col gap-6" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      {runningTotal !== undefined && (
        <p className="-mb-2 text-center text-[14px] text-slate-500">
          Trip so far <Taka poisha={runningTotal} className="font-semibold text-slate-800" />
          {total ? <> then <Taka poisha={runningTotal + total} className="font-semibold text-slate-800" /></> : null}
        </p>
      )}

      <div className="rounded-3xl border border-slate-200/80 bg-white px-5 pb-5 pt-6">
        <Field label="Amount (৳)" htmlFor="amount" srLabel
               error={draft.amount !== '' && total === null ? 'Enter a valid amount.' : undefined}
               hint={total !== null && total > SANITY_BOUND_POISHA ? 'That looks unusually large. Check the amount.' : undefined}>
          <div className="flex items-baseline justify-center gap-1.5">
            <span className="font-display text-[30px] font-semibold text-slate-400" aria-hidden>৳</span>
            <input
              id="amount" ref={amountRef} autoFocus inputMode="decimal" autoComplete="off" placeholder="0"
              className="w-full min-w-0 max-w-[14rem] bg-transparent text-center font-display text-[44px] font-semibold leading-tight text-slate-900 tnum placeholder:text-slate-300 focus:outline-none"
              value={draft.amount}
              onChange={(e) => isPartialTakaInput(e.target.value) && set({ amount: e.target.value })}
            />
          </div>
        </Field>
        <div className="mt-4">
          <Field label="What was it?" htmlFor="desc" srLabel
                 hint={total && draft.description.trim() === '' ? 'Add a description so it can be checked later.' : undefined}>
            <Input id="desc" maxLength={200} placeholder="What was it? Dinner, rickshaw, tickets…" value={draft.description}
                   className="text-center" onChange={(e) => set({ description: e.target.value })} enterKeyHint="done" />
          </Field>
        </div>
      </div>

      <div className="space-y-2">
        <ListGroup>
          <ListRow onClick={() => setSheet('payer')} chevron
                   leading={<Avatar name={nameOf(draft.payerId)} seed={draft.payerId} />}
                   title={<><span className="font-normal text-slate-500">Paid by </span>{nameOf(draft.payerId)}</>}
                   aria-label={`Paid by ${nameOf(draft.payerId)}. Change`} />
          <ListRow onClick={() => setSheet('split')} chevron data-tour="split-row"
                   leading={<IconTile tone="brand"><Users size={20} /></IconTile>}
                   title={<><span className="font-normal text-slate-500">Split </span>{splitWho}</>}
                   subtitle={splitSummary}
                   aria-label={`Split between ${splitWho}, ${splitSummary}. Change`} />
        </ListGroup>
        {total && splitProblem ? <p className="px-1 text-[13px] text-owe" role="alert">{splitProblem}</p> : null}
        {total && !draft.participants.includes(draft.payerId) && othersCharged > 0 ? (
          <p className="px-1 text-[13px] text-slate-500">{nameOf(draft.payerId)} paid but isn’t in the split, so they’re owed the whole amount.</p>
        ) : null}
      </div>

      {error && <p className="rounded-2xl bg-owe-soft px-4 py-3 text-[15px] text-owe" role="alert">Couldn’t save. {error}</p>}

      <StickyFooter>
        <Button type="submit" size="lg" block busy={busy} disabled={!!problem} className="h-14 rounded-2xl text-[16px]">
          {total ? `Save ${formatTaka(total)}` : 'Save'}
        </Button>
      </StickyFooter>

      <Sheet open={sheet === 'payer'} onClose={() => setSheet(null)} title="Who paid?">
        <ListGroup className="-mx-1">
          {payerOptions.map((p) => (
            <ListRow key={p.id} onClick={() => { set({ payerId: p.id }); setSheet(null); }}
                     leading={<Avatar name={p.name} seed={p.id} />} title={p.id === me ? 'You' : p.name}
                     trailing={draft.payerId === p.id ? <Check size={20} className="text-brand" aria-label="Selected" /> : undefined} />
          ))}
        </ListGroup>
      </Sheet>

      <Sheet open={sheet === 'split'} onClose={() => setSheet(null)} title="Split between"
             footer={<Button block size="lg" onClick={() => setSheet(null)}>Done</Button>}>
        <div className="space-y-5">
          <ParticipantPicker
            roster={roster} others={others} selected={draft.participants}
            onChange={(ids) => set({ participants: ids })}
            presets={presets.map((p) => ({ id: p.id, label: p.label, userIds: p.user_ids }))}
            recent={recentSets}
          />
          <Segmented label="How to split" value={draft.mode} onChange={(mode) => set({ mode })}
                     options={[{ value: 'equal', label: 'Equally' }, { value: 'unequal', label: 'Unequally' }]} />
          {total ? (
            <div className="rounded-2xl border border-slate-200/80">
              {draft.mode === 'unequal' && (
                <div className={cn('flex items-center justify-between gap-2 rounded-t-2xl px-4 py-2.5 text-[14px]',
                  assigned === total ? 'bg-owed-soft text-owed' : 'bg-pending-soft text-pending')}>
                  <span className="tnum">{formatTaka(assigned)} of {formatTaka(total)}</span>
                  {assigned < total && (
                    <button type="button" className="font-semibold underline underline-offset-2"
                      onClick={() => {
                        const next = splitRemainder(total, shares, draft.participants);
                        set({ custom: Object.fromEntries([...next].map(([k, v]) => [k, poishaToInput(v)])) });
                      }}>
                      Split the rest evenly
                    </button>
                  )}
                </div>
              )}
              <ul className="divide-y divide-slate-100 px-4">
                {draft.participants.map((id) => (
                  <li key={id} className="flex min-h-[48px] items-center justify-between gap-3 py-1.5 text-[15px]">
                    <span className="flex min-w-0 items-center gap-2.5 text-slate-800">
                      <Avatar name={nameOf(id)} seed={id} size={28} /><span className="truncate">{nameOf(id)}</span>
                    </span>
                    {draft.mode === 'equal' ? (
                      <span className="text-slate-900 tnum">
                        {formatTaka(shares.get(id) ?? 0)}
                        {extraPoisha.has(id) && <span className="ml-1 text-xs text-slate-500" title="Remainder poisha are assigned in a fixed order">+1 poisha</span>}
                      </span>
                    ) : (
                      <Input inputMode="decimal" className="h-10 w-28 text-right tnum" placeholder="0"
                             aria-label={`Share for ${nameOf(id)}`} value={draft.custom[id] ?? ''}
                             onChange={(e) => isPartialTakaInput(e.target.value) &&
                               set({ custom: { ...draft.custom, [id]: e.target.value } })} />
                    )}
                  </li>
                ))}
              </ul>
              {extraPoisha.size > 0 && (
                <p className="border-t border-slate-100 px-4 py-2.5 text-[13px] text-slate-500">
                  Leftover poisha go to people in a fixed order, not at random.
                </p>
              )}
            </div>
          ) : (
            <p className="flex items-center gap-2 text-[14px] text-slate-500"><Wallet size={16} aria-hidden /> Enter an amount to see each share.</p>
          )}
        </div>
      </Sheet>

      <Sheet open={!!confirm} onClose={() => setConfirm(null)}
             title={confirm?.kind === 'large' ? 'Check the amount' : 'Possible duplicate'}
             footer={
               <div className="grid grid-cols-2 gap-2">
                 <Button variant="secondary" onClick={() => { setConfirm(null); amountRef.current?.focus(); }}>Go back</Button>
                 <Button onClick={() => {
                   const c = confirm; setConfirm(null);
                   void save(c?.kind === 'large' ? { large: true } : { large: true, duplicate: true });
                 }}>Add anyway</Button>
               </div>
             }>
        <p className="text-[15px] text-slate-700">
          {confirm?.kind === 'large'
            ? `${formatTaka(total ?? 0)} looks unusually large. Is that right?`
            : confirm?.kind === 'duplicate' ? confirm.text : ''}
        </p>
      </Sheet>

      <SavePresetSheet
        ids={offerPreset} tripId={tripId} nameOf={nameOf}
        onDone={() => { setOfferPreset(null); if (pendingSaved.current) onSaved(pendingSaved.current); }}
      />
    </form>
  );
}

/**
 * D-03#3: after the same subset is used twice on a trip, offer to save it.
 * Usage counts are a per-device convenience kept in local storage.
 */
function maybeOfferPreset(tripId: string, ids: string[], rosterSize: number, presets: TripPreset[]): boolean {
  if (ids.length < 2 || ids.length >= rosterSize) return false;
  const key = [...ids].sort().join(',');
  if (presets.some((p) => [...p.user_ids].sort().join(',') === key)) return false;
  try {
    const store = JSON.parse(localStorage.getItem(`hn.subsets.${tripId}`) ?? '{}') as Record<string, number>;
    store[key] = (store[key] ?? 0) + 1;
    localStorage.setItem(`hn.subsets.${tripId}`, JSON.stringify(store));
    return store[key] === 2;
  } catch {
    return false;
  }
}

function SavePresetSheet({ ids, tripId, nameOf, onDone }: {
  ids: string[] | null; tripId?: string; nameOf: (id: string) => string; onDone: () => void;
}) {
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();
  if (!ids || !tripId) return null;
  return (
    <Sheet open onClose={onDone} title="Save this group of people?"
           footer={
             <div className="grid grid-cols-2 gap-2">
               <Button variant="secondary" onClick={onDone}>Not now</Button>
               <Button busy={busy} disabled={!label.trim()} onClick={async () => {
                 setBusy(true);
                 // Presets carry no financial effect, so RLS permits a direct insert (§12.4).
                 const { error } = await supabase.from('trip_presets').insert({ trip_id: tripId, label: label.trim(), user_ids: ids });
                 setBusy(false);
                 if (error) toast(errorMessage(error), 'error');
                 else { toast('Preset saved'); void qc.invalidateQueries({ queryKey: ['trip', tripId] }); }
                 onDone();
               }}>Save</Button>
             </div>
           }>
      <p className="mb-3 text-[15px] text-slate-600">You’ve split with {ids.map(nameOf).join(', ')} twice.</p>
      <Field label="Name" htmlFor="preset-label">
        <Input id="preset-label" placeholder="e.g. Fort group" maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} />
      </Field>
    </Sheet>
  );
}
