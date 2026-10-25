import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toAppError } from '@/lib/errors';
import type { PairwiseNet } from '@/lib/types';

/** Every non-zero pairwise balance in a group, as a lookup: owes(a, b). */
export function useAllPairs(groupId: string) {
  return useQuery({
    queryKey: ['allPairs', groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_pairwise_net').select('*').eq('group_id', groupId).gt('owed_poisha', 0);
      if (error) throw toAppError(error);
      const map = new Map<string, number>();
      for (const r of data as PairwiseNet[]) map.set(`${r.from_user}>${r.to_user}`, r.owed_poisha);
      /** How much a owes b right now (negative if b owes a). */
      const owes = (a: string, b: string) => (map.get(`${a}>${b}`) ?? 0) - (map.get(`${b}>${a}`) ?? 0);
      return { owes, rows: data as PairwiseNet[] };
    },
  });
}
