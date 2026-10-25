import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Chip, Field, Input, Segmented, Sheet } from './ui';
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

  const problem =
    !total ? 'Enter an amount.'
    : draft.description.trim() === '' ? 'Add a description — an unlabelled expense can’t be checked later.'
    : draft.participants.length === 0 ? 'Pick who shared this.'
    : draft.mode === 'unequal' && assigned < total ? `${formatTaka(total - assigned)} still unassigned.`
    : draft.mode === 'unequal' && assigned > total ? `${formatTaka(assigned - total)} over.`
    : othersCharged === 0 ? 'An expense needs at least one other person.'
    : null;

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
            text: `A similar expense (“${similar.description}”, added by ${similar.created_by_name}) was added ${timeAgo(similar.created_at)} — add anyway?`,
          });
          return;
        }
      }
      const id = await rpc.addExpense({
        groupId, payerId: draft.payerId, total, description: draft.description.trim(), tripId,
        shares: [...shares].map(([user_id, share]) => ({ user_id, share })),
        clientToken: draft.clientToken,
      });
      toast(`Saved — ${formatTaka(total)}`);
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

  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      {runningTotal !== undefined && (
        <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-600">
          Trip so far: <Taka poisha={runningTotal} className="font-semibold text-slate-900" />
          {total ? <> → <Taka poisha={runningTotal + total} className="font-semibold text-slate-900" /></> : null}
        </p>
      )}

      <Field label="Amount (৳)" htmlFor="amount">
        <Input
          id="amount" ref={amountRef} autoFocus inputMode="decimal" autoComplete="off" placeholder="0"
          className="h-14 text-2xl font-semibold tabular-nums"
          value={draft.amount}
          onChange={(e) => isPartialTakaInput(e.target.value) && set({ amount: e.target.value })}
        />
      </Field>
      {total !== null && total > SANITY_BOUND_POISHA && (
        <p className="-mt-3 text-sm text-amber-700">That looks unusually large — check the amount.</p>
      )}

      <Field label="What was it?" htmlFor="desc">
        <Input id="desc" maxLength={200} placeholder="Auto rickshaw, dinner, tickets…" value={draft.description}
               onChange={(e) => set({ description: e.target.value })} enterKeyHint="done" />
      </Field>

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">Paid by</p>
        <div className="flex flex-wrap gap-2">
          {people.filter((p) => p.id === me || roster.some((r) => r.id === p.id) || p.id === draft.payerId)
            .sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : 0))
            .map((p) => (
              <Chip key={p.id} selected={draft.payerId === p.id} onClick={() => set({ payerId: p.id })}>
                {p.id === me ? 'You' : p.name}
              </Chip>
            ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">Split between</p>
        <ParticipantPicker
          roster={roster} others={others} selected={draft.participants}
          onChange={(ids) => set({ participants: ids })}
          presets={presets.map((p) => ({ id: p.id, label: p.label, userIds: p.user_ids }))}
          recent={recentSets}
        />
      </div>

      <Segmented label="How to split" value={draft.mode} onChange={(mode) => set({ mode })}
                 options={[{ value: 'equal', label: 'Equally' }, { value: 'unequal', label: 'Unequally' }]} />

      {total ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          {draft.mode === 'unequal' && (
            <div className={cn('mb-2 flex items-center justify-between rounded-lg px-2 py-1.5 text-sm',
              assigned === total ? 'bg-owed-soft text-owed' : 'bg-amber-50 text-amber-800')}>
              <span>{formatTaka(assigned)} of {formatTaka(total)} assigned</span>
              {assigned < total && (
                <button type="button" className="font-medium underline"
                  onClick={() => {
                    const next = splitRemainder(total, shares, draft.participants);
                    set({ custom: Object.fromEntries([...next].map(([k, v]) => [k, poishaToInput(v)])) });
                  }}>
                  Split the rest evenly
                </button>
              )}
            </div>
          )}
          <ul className="divide-y divide-slate-100">
            {draft.participants.map((id) => (
              <li key={id} className="flex items-center justify-between gap-3 py-1.5 text-[15px]">
                <span className="text-slate-700">{nameOf(id)}</span>
                {draft.mode === 'equal' ? (
                  <span className="tabular-nums text-slate-900">
                    {formatTaka(shares.get(id) ?? 0)}
                    {extraPoisha.has(id) && <span className="ml-1 text-xs text-slate-500" title="Remainder poisha are assigned in a fixed order">+1 poisha</span>}
                  </span>
                ) : (
                  <Input inputMode="decimal" className="h-9 w-28 text-right tabular-nums" placeholder="0"
                         aria-label={`Share for ${nameOf(id)}`} value={draft.custom[id] ?? ''}
                         onChange={(e) => isPartialTakaInput(e.target.value) &&
                           set({ custom: { ...draft.custom, [id]: e.target.value } })} />
                )}
              </li>
            ))}
          </ul>
          {extraPoisha.size > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              {formatTaka(total)} doesn’t divide evenly by {draft.participants.length}. The leftover poisha go to
              people in a fixed, repeatable order — not at random.
            </p>
          )}
          {!draft.participants.includes(draft.payerId) && othersCharged > 0 && (
            <p className="mt-2 text-xs text-slate-500">{nameOf(draft.payerId)} paid but isn’t in the split, so they’re owed the whole amount.</p>
          )}
        </div>
      ) : null}

      {error && <p className="rounded-xl bg-owe-soft px-3 py-2 text-sm text-owe" role="alert">Couldn’t save. {error}</p>}

      <div className="sticky bottom-20 z-10 -mx-4 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent px-4 pb-2 pt-4">
        <Button type="submit" size="lg" block busy={busy} disabled={!!problem}>
          {problem && total ? problem : total ? `Save ${formatTaka(total)}` : 'Enter an amount'}
        </Button>
      </div>

      <Sheet open={!!confirm} onClose={() => setConfirm(null)}
             title={confirm?.kind === 'large' ? 'Check the amount' : 'Possible duplicate'}>
        <p className="text-[15px] text-slate-700">
          {confirm?.kind === 'large'
            ? `${formatTaka(total ?? 0)} looks unusually large — is that right?`
            : confirm?.kind === 'duplicate' ? confirm.text : ''}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => { setConfirm(null); amountRef.current?.focus(); }}>Go back</Button>
          <Button onClick={() => {
            const c = confirm; setConfirm(null);
            void save(c?.kind === 'large' ? { large: true } : { large: true, duplicate: true });
          }}>Add anyway</Button>
        </div>
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
    <Sheet open onClose={onDone} title="Save this group of people?">
      <p className="mb-3 text-sm text-slate-600">{ids.map(nameOf).join(', ')} — you’ve used this set twice.</p>
      <Input placeholder="e.g. Fort group" maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} />
      <div className="mt-4 grid grid-cols-2 gap-2">
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
    </Sheet>
  );
}
