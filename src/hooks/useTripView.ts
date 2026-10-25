import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toAppError } from '@/lib/errors';
import type { LedgerEntry } from '@/lib/types';
import { useMe } from './useAuth';
import { useMembers } from './useGroups';
import { useExpenses } from './useGroupLedger';
import { useTrip } from './useTrips';

/** Everything a trip screen needs, assembled once. */
export function useTripView(tripId: string) {
  const me = useMe();
  const trip = useTrip(tripId);
  const groupId = trip.data?.trip.group_id ?? '';
  const members = useMembers(groupId);
  const expenses = useExpenses(groupId, tripId);

  // My trip-scoped pairwise balances: the same derivation, filtered by trip_id.
  const myEntries = useQuery({
    queryKey: ['tripMine', groupId, tripId, me],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase.from('ledger_entries').select('*')
        .eq('trip_id', tripId).or(`from_user.eq.${me},to_user.eq.${me}`);
      if (error) throw toAppError(error);
      return data as LedgerEntry[];
    },
  });

  return useMemo(() => {
    const leaderIds = new Set(trip.data?.leaders.map((l) => l.user_id) ?? []);
    const memberName = new Map((members.data ?? []).map((m) => [m.user_id, m.profile.display_name]));
    const name = (id: string | null | undefined, opts: { you?: boolean } = {}) =>
      !id ? '(former member)' : opts.you && id === me ? 'You' : memberName.get(id) ?? '(former member)';
    const rosterIds = trip.data?.memberIds ?? [];
    const roster = rosterIds.map((id) => ({ id, name: name(id, { you: true }), isLeader: leaderIds.has(id) }));
    const others = (members.data ?? []).filter((m) => !rosterIds.includes(m.user_id))
      .map((m) => ({ id: m.user_id, name: m.profile.display_name }));
    const live = (expenses.data ?? []).filter((e) => !e.voided_at);
    const runningTotal = live.reduce((s, e) => s + e.total_poisha, 0);

    const pairMap = new Map<string, number>();
    for (const e of myEntries.data ?? []) {
      const other = e.from_user === me ? e.to_user : e.from_user;
      pairMap.set(other, (pairMap.get(other) ?? 0) + (e.to_user === me ? e.amount_poisha : -e.amount_poisha));
    }
    const pairs = [...pairMap].filter(([, v]) => v !== 0).map(([otherId, poisha]) => ({ otherId, name: name(otherId), poisha }));

    // Feature 4.4: the last three distinct participant sets used on this trip.
    const seen = new Set<string>();
    const recentSets: string[][] = [];
    for (const e of expenses.data ?? []) {
      const ids = (e.expense_shares ?? []).filter((s) => s.share_poisha > 0).map((s) => s.user_id).sort();
      const key = ids.join();
      if (ids.length < 2 || ids.length === rosterIds.length || seen.has(key)) continue;
      seen.add(key);
      recentSets.push(ids);
      if (recentSets.length === 3) break;
    }

    return {
      me, trip, groupId, members, expenses, myEntries, leaderIds, name, roster, others,
      runningTotal, pairs, recentSets,
      isLeader: trip.data?.trip.status === 'active' && leaderIds.has(me),
    };
  }, [me, trip, groupId, members, expenses, myEntries]);
}
