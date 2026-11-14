import { useQuery } from '@tanstack/react-query';
import { rpc } from '@/lib/rpc';
import { useMe } from './useAuth';

/**
 * Feature 4.5 — the derivation, plus the I6 self-check: the final running
 * total must equal net_owed() for the same pair.  Both are fetched together so
 * the comparison is against the same moment.
 */
export function useExplain(groupId: string, otherId: string) {
  const me = useMe();
  return useQuery({
    queryKey: ['explain', groupId, otherId],
    enabled: !!groupId && !!otherId,
    queryFn: async () => {
      const rows = await rpc.explainBalance(groupId, otherId);
      const expected = await rpc.netOwed(groupId, otherId, me); // + they owe me
      const final = rows.length ? rows[rows.length - 1]!.running_poisha : 0;
      if (final !== expected) {
        // Story E-01#2: never hidden, and logged.
        console.error('I6 VIOLATION: derivation total', final, '≠ balance', expected, { groupId, otherId });
      }
      return { rows, final, expected, consistent: final === expected };
    },
  });
}
