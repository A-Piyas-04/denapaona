import { useQuery } from '@tanstack/react-query';
import { rpc } from '@/lib/rpc';
import { useMe } from './useAuth';

/**
 * Pair derivation + I6 self-check.  Pass groupId for outing-scoped history;
 * omit it for the global Home ledger (all rows between the pair).
 */
export function useExplain(groupId: string | undefined, otherId: string) {
  const me = useMe();
  return useQuery({
    queryKey: ['explain', groupId ?? 'global', otherId],
    enabled: !!otherId,
    queryFn: async () => {
      const rows = groupId
        ? await rpc.explainBalance(groupId, otherId)
        : await rpc.explainBalanceGlobal(otherId);
      const expected = groupId
        ? await rpc.netOwed(groupId, otherId, me)
        : await rpc.netOwedGlobal(otherId, me); // + they owe me
      const final = rows.length ? rows[rows.length - 1]!.running_poisha : 0;
      if (final !== expected) {
        console.error('I6 VIOLATION: derivation total', final, '≠ balance', expected, { groupId, otherId });
      }
      return { rows, final, expected, consistent: final === expected };
    },
  });
}
