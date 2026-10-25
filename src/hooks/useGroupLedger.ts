import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toAppError } from '@/lib/errors';
import type { Expense, LedgerEntry, Proposal, TripLeaderLog } from '@/lib/types';
import { fetchAttribution, type Attribution } from '@/lib/rpc';

const EXPENSE_SELECT = '*, expense_shares(*), entry_disputes(*)';

export function useExpenses(groupId: string, tripId?: string) {
  return useQuery({
    queryKey: ['expenses', groupId, tripId ?? null],
    enabled: !!groupId,
    queryFn: async () => {
      let qb = supabase.from('expenses').select(EXPENSE_SELECT).eq('group_id', groupId);
      if (tripId) qb = qb.eq('trip_id', tripId);
      const { data, error } = await qb.order('created_at', { ascending: false }).order('id', { ascending: false });
      if (error) throw toAppError(error);
      return data as Expense[];
    },
  });
}

export function useExpense(expenseId: string) {
  return useQuery({
    queryKey: ['expense', expenseId],
    enabled: !!expenseId,
    queryFn: async () => {
      const { data, error } = await supabase.from('expenses').select(EXPENSE_SELECT).eq('id', expenseId).single();
      if (error) throw toAppError(error);
      return data as Expense;
    },
  });
}

export type HistoryItem =
  | { kind: 'expense'; at: string; id: string; expense: Expense }
  | { kind: 'void'; at: string; id: string; expense: Expense }
  | { kind: 'proposal'; at: string; id: string; proposal: Proposal }
  | { kind: 'leader'; at: string; id: string; log: TripLeaderLog };

const PAGE = 30;

/**
 * Story B-05: the full history, reverse-chronological, never silently
 * truncated.  Each page fetches the next slice of each source older than the
 * cursor and merges them; order is (created_at, id) so it never shifts (B-05#4).
 */
export function useHistory(groupId: string) {
  return useInfiniteQuery({
    queryKey: ['history', groupId],
    enabled: !!groupId,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      let exQ = supabase.from('expenses').select(EXPENSE_SELECT).eq('group_id', groupId);
      let voidQ = supabase.from('expenses').select(EXPENSE_SELECT).eq('group_id', groupId).not('voided_at', 'is', null);
      let propQ = supabase.from('proposals').select('*, proposal_participants(*)').eq('group_id', groupId);
      let logQ = supabase.from('trip_leader_log').select('*, trips!inner(group_id)').eq('trips.group_id', groupId);
      if (pageParam) {
        exQ = exQ.lt('created_at', pageParam);
        voidQ = voidQ.lt('voided_at', pageParam);
        propQ = propQ.lt('created_at', pageParam);
        logQ = logQ.lt('created_at', pageParam);
      }
      const [ex, voids, props, logs] = await Promise.all([
        exQ.order('created_at', { ascending: false }).limit(PAGE),
        voidQ.order('voided_at', { ascending: false }).limit(PAGE),
        propQ.order('created_at', { ascending: false }).limit(PAGE),
        logQ.order('created_at', { ascending: false }).limit(PAGE),
      ]);
      for (const r of [ex, voids, props, logs]) if (r.error) throw toAppError(r.error);

      const items: HistoryItem[] = [
        ...(ex.data as Expense[]).map((e) => ({ kind: 'expense' as const, at: e.created_at, id: e.id, expense: e })),
        ...(voids.data as Expense[]).map((e) => ({ kind: 'void' as const, at: e.voided_at!, id: `void-${e.id}`, expense: e })),
        ...(props.data as Proposal[]).map((p) => ({ kind: 'proposal' as const, at: p.created_at, id: p.id, proposal: p })),
        ...(logs.data as TripLeaderLog[]).map((l) => ({ kind: 'leader' as const, at: l.created_at, id: l.id, log: l })),
      ];
      items.sort((a, b) => (a.at === b.at ? (a.id < b.id ? 1 : -1) : a.at < b.at ? 1 : -1));

      // Only what is strictly newer than the oldest item from a FULL source is
      // safe to show; anything older may still be missing from another source.
      const full = [ex.data, voids.data, props.data, logs.data].filter((d) => (d?.length ?? 0) === PAGE);
      const fullOldest = (d: unknown[], key: 'created_at' | 'voided_at') =>
        (d[d.length - 1] as Record<string, string>)[key]!;
      let cutoff: string | null = null;
      if (full.length > 0) {
        const candidates: string[] = [];
        if ((ex.data?.length ?? 0) === PAGE) candidates.push(fullOldest(ex.data!, 'created_at'));
        if ((voids.data?.length ?? 0) === PAGE) candidates.push(fullOldest(voids.data!, 'voided_at'));
        if ((props.data?.length ?? 0) === PAGE) candidates.push(fullOldest(props.data!, 'created_at'));
        if ((logs.data?.length ?? 0) === PAGE) candidates.push(fullOldest(logs.data!, 'created_at'));
        cutoff = candidates.sort().reverse()[0]!;
      }
      const shown = cutoff ? items.filter((i) => i.at >= cutoff!) : items;
      return { items: shown, next: cutoff };
    },
    getNextPageParam: (last) => last.next,
  });
}

/** Ledger entries newer than a moment, involving me — for "what changed" (G-02). */
export function useRecentEntries(groupId: string, me: string, since: string | null) {
  return useQuery({
    queryKey: ['recent', groupId, me, since],
    enabled: !!since,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ledger_entries').select('*').eq('group_id', groupId)
        .or(`from_user.eq.${me},to_user.eq.${me}`).gt('created_at', since!)
        .order('created_at', { ascending: false }).limit(50);
      if (error) throw toAppError(error);
      return data as LedgerEntry[];
    },
  });
}


/** Leader / agreement labels for expenses, with role at write time (E-03). */
export function useAttribution(groupId: string, tripId?: string | null) {
  return useQuery({
    queryKey: ['attribution', groupId, tripId ?? null],
    enabled: !!groupId,
    queryFn: async () => {
      const rows = await fetchAttribution(groupId, tripId);
      return new Map<string, Attribution>(rows.map((r) => [r.expense_id, r]));
    },
  });
}
