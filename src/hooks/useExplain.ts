import { useQuery } from '@tanstack/react-query';
import { rpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';
import { toAppError } from '@/lib/errors';
import { useMe } from './useAuth';

/**
 * Feature 4.5 — the derivation, plus the I6 self-check: the final running
 * total must equal net_owed() for the same pair.  Both are fetched together so
 * the comparison is against the same moment.
 */
export function useExplain(groupId: string, otherId: string, tripId: string | null) {
  const me = useMe();
  return useQuery({
    queryKey: ['explain', groupId, otherId, tripId],
    enabled: !!groupId && !!otherId,
    queryFn: async () => {
      const rows = await rpc.explainBalance(groupId, otherId, tripId);
      let expected: number;
      if (tripId) {
        // trip-scoped: compare with the same filter over the ledger
        const { data, error } = await supabase
          .from('ledger_entries').select('from_user, to_user, amount_poisha')
          .eq('trip_id', tripId).in('from_user', [me, otherId]).in('to_user', [me, otherId]);
        if (error) throw toAppError(error);
        expected = (data as { from_user: string; to_user: string; amount_poisha: number }[])
          .reduce((s, e) => s + (e.to_user === me ? e.amount_poisha : -e.amount_poisha), 0);
      } else {
        expected = await rpc.netOwed(groupId, otherId, me); // + they owe me
      }
      const final = rows.length ? rows[rows.length - 1]!.running_poisha : 0;
      if (final !== expected) {
        // Story E-01#2: never hidden, and logged.
        console.error('I6 VIOLATION: derivation total', final, '≠ balance', expected, { groupId, otherId, tripId });
      }
      return { rows, final, expected, consistent: final === expected };
    },
  });
}
