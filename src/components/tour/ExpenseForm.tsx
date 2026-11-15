import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Field, Input } from '@/components/ui';
import type { TourMember } from '@/lib/tourRpc';
import { tourErrorMessage, tourRpc } from '@/lib/tourRpc';
import { formatTourTaka, parseTakaToPaisa } from '@/lib/tourMoney';
import type { Contribution, SplitMode } from '@/lib/tourSettlement';
import { cn } from '@/lib/format';

interface PayerRow {
  key: number;
  userId: string;
  taka: string;
}

function tryPaisa(value: string, allowZero = false): number | null {
  try {
    return parseTakaToPaisa(value, { allowZero });
  } catch {
    return null;
  }
}

export function ExpenseForm({
  tourId,
  members,
}: {
  tourId: string;
  members: TourMember[];
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [totalTaka, setTotalTaka] = useState('');
  const [participants, setParticipants] = useState<Set<string>>(new Set());
  const [bills, setBills] = useState<Record<string, string>>({});
  const [payers, setPayers] = useState<PayerRow[]>([
    { key: 1, userId: members[0]?.userId ?? '', taka: '' },
  ]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const selectedMembers = useMemo(
    () => members.filter((m) => participants.has(m.userId)),
    [members, participants],
  );

  const billsComplete =
    selectedMembers.length > 0 &&
    selectedMembers.every((m) => tryPaisa(bills[m.userId] ?? '', true) !== null);
  const billsTotalPaisa = selectedMembers.reduce(
    (sum, m) => sum + (tryPaisa(bills[m.userId] ?? '', true) ?? 0),
    0,
  );

  const totalPaisa =
    splitMode === 'individual'
      ? billsComplete && billsTotalPaisa > 0
        ? billsTotalPaisa
        : null
      : tryPaisa(totalTaka);

  const paidPaisa = useMemo(
    () => payers.reduce((sum, p) => sum + (tryPaisa(p.taka) ?? 0), 0),
    [payers],
  );
  const amountsMatch = totalPaisa !== null && paidPaisa === totalPaisa;
  const canSubmit =
    !busy &&
    title.trim() !== '' &&
    totalPaisa !== null &&
    participants.size > 0 &&
    payers.every((p) => p.userId && tryPaisa(p.taka) !== null) &&
    amountsMatch;

  function toggleParticipant(id: string) {
    setParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updatePayer(key: number, patch: Partial<PayerRow>) {
    setPayers((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  function reset() {
    setTitle('');
    setTotalTaka('');
    setBills({});
    setParticipants(new Set());
    setPayers([{ key: Date.now(), userId: members[0]?.userId ?? '', taka: '' }]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || totalPaisa === null) return;
    setBusy(true);
    setToast(null);
    try {
      const contributions: Contribution[] = payers.map((p) => ({
        user_id: p.userId,
        amount_paisa: parseTakaToPaisa(p.taka),
      }));
      const shares =
        splitMode === 'individual'
          ? selectedMembers.map((m) => ({
              user_id: m.userId,
              amount_paisa: parseTakaToPaisa(bills[m.userId] ?? '', { allowZero: true }),
            }))
          : undefined;
      await tourRpc.addExpense({
        tourId,
        title: title.trim(),
        amountPaisa: totalPaisa,
        participantIds: selectedMembers.map((m) => m.userId),
        contributions,
        splitMode,
        shares,
      });
      setToast({ kind: 'ok', msg: 'Expense saved.' });
      reset();
      void qc.invalidateQueries({ queryKey: ['tour', tourId] });
    } catch (err) {
      setToast({ kind: 'err', msg: tourErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-2xl border border-night-line/70 bg-paper p-5 shadow-soft"
    >
      <h2 className="text-lg font-semibold text-ink">Add expense</h2>

      <Field label="Title">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          placeholder="Breakfast at KFC"
          required
        />
      </Field>

      <div className="space-y-1">
        <span className="text-sm font-medium text-ink">How is it split?</span>
        <div className="flex gap-2 rounded-xl bg-night-elev p-1">
          {(
            [
              ['equal', 'Equal split'],
              ['individual', 'Individual bills'],
            ] as const
          ).map(([mode, label]) => (
            <button
              type="button"
              key={mode}
              aria-pressed={splitMode === mode}
              onClick={() => setSplitMode(mode)}
              className={cn(
                'min-h-[40px] flex-1 rounded-lg px-3 text-sm font-medium',
                splitMode === mode ? 'bg-paper text-brand shadow-soft' : 'text-ink-soft',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {splitMode === 'equal' && (
        <Field label="Total amount (৳)">
          <Input
            value={totalTaka}
            onChange={(e) => setTotalTaka(e.target.value)}
            inputMode="decimal"
            placeholder="1000.00"
            required
          />
        </Field>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-ink">
            Who shared this expense?{' '}
            <span className="font-normal text-ink-soft">({participants.size} selected)</span>
          </span>
          <div className="flex gap-2 text-xs font-semibold text-brand">
            <button
              type="button"
              onClick={() => setParticipants(new Set(members.map((m) => m.userId)))}
            >
              Select all
            </button>
            <button type="button" onClick={() => setParticipants(new Set())} className="text-ink-soft">
              Clear
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => {
            const active = participants.has(m.userId);
            return (
              <button
                type="button"
                key={m.userId}
                onClick={() => toggleParticipant(m.userId)}
                className={cn(
                  'min-h-[40px] max-w-full break-words rounded-full border px-3 py-1 text-left text-sm font-medium',
                  active
                    ? 'border-brand bg-brand text-brand-fg'
                    : 'border-night-line bg-paper text-ink',
                )}
              >
                {m.name}
              </button>
            );
          })}
        </div>
      </div>

      {splitMode === 'individual' && (
        <div className="space-y-2">
          <span className="text-sm font-medium text-ink">Each person&apos;s bill (৳)</span>
          {selectedMembers.length === 0 ? (
            <p className="rounded-xl border border-dashed border-night-line p-3 text-sm text-ink-soft">
              Select who shared this expense first.
            </p>
          ) : (
            selectedMembers.map((m) => {
              const raw = bills[m.userId] ?? '';
              const invalid = raw.trim() !== '' && tryPaisa(raw, true) === null;
              return (
                <div key={m.userId} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 break-words text-sm text-ink">{m.name}</span>
                  <Input
                    value={raw}
                    onChange={(e) => setBills((prev) => ({ ...prev, [m.userId]: e.target.value }))}
                    inputMode="decimal"
                    placeholder="৳"
                    aria-label={`Bill for ${m.name}`}
                    aria-invalid={invalid}
                    className={cn('w-28 shrink-0', invalid && 'border-owe')}
                  />
                </div>
              );
            })
          )}
          <div className="flex items-center justify-between rounded-xl bg-night-elev px-3 py-2 text-sm text-ink">
            <span>Total (auto)</span>
            <span className="font-semibold tabular-nums">
              {billsComplete ? formatTourTaka(billsTotalPaisa) : '—'}
            </span>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <span className="text-sm font-medium text-ink">Who actually paid?</span>
        {payers.map((p) => (
          <div key={p.key} className="flex gap-2">
            <select
              value={p.userId}
              onChange={(e) => updatePayer(p.key, { userId: e.target.value })}
              className="min-h-[44px] w-full min-w-0 flex-1 rounded-xl border border-night-line bg-paper px-2 text-sm text-ink"
            >
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
            <Input
              value={p.taka}
              onChange={(e) => updatePayer(p.key, { taka: e.target.value })}
              inputMode="decimal"
              placeholder="৳"
              className="w-24 shrink-0"
            />
            <button
              type="button"
              onClick={() =>
                setPayers((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.key !== p.key)))
              }
              disabled={payers.length <= 1}
              aria-label="Remove payer"
              className="min-h-[44px] w-11 shrink-0 rounded-xl border border-night-line text-ink-soft disabled:opacity-40"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setPayers((prev) => [
              ...prev,
              { key: Date.now(), userId: members[0]?.userId ?? '', taka: '' },
            ])
          }
          className="text-sm font-semibold text-brand"
        >
          + Add payer
        </button>
      </div>

      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl px-3 py-2 text-sm',
          amountsMatch ? 'bg-owed/10 text-owed' : 'bg-pending-soft text-pending',
        )}
      >
        <span>
          Paid {formatTourTaka(paidPaisa)} / Total{' '}
          {totalPaisa === null ? '—' : formatTourTaka(totalPaisa)}
        </span>
        <span className="font-semibold">{amountsMatch ? 'Matches' : 'Must match exactly'}</span>
      </div>

      {toast && (
        <p className={cn('text-sm', toast.kind === 'ok' ? 'text-owed' : 'text-owe')}>{toast.msg}</p>
      )}

      <Button type="submit" block size="lg" disabled={!canSubmit}>
        {busy ? 'Saving…' : 'Save Expense'}
      </Button>
    </form>
  );
}
