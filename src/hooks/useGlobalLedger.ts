import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toAppError } from '@/lib/errors';
import { FORMER_MEMBER } from '@/lib/format';
import type { Profile } from '@/lib/types';
import { useMe } from './useAuth';

async function q<T>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw toAppError(error);
  return data as T;
}

export interface GlobalPair {
  otherId: string;
  name: string;
  /** + they should give me, − I should give them. */
  poisha: number;
}

/** My global pairwise balances across every ledger row (outing + claims). */
export function useGlobalPairs() {
  const me = useMe();
  return useQuery({
    queryKey: ['globalPairs', me],
    queryFn: async (): Promise<GlobalPair[]> => {
      const rows = await q<{ from_user: string; to_user: string; owed_poisha: number }[]>(
        supabase.from('v_global_pairwise_net').select('*').eq('from_user', me),
      );
      const otherIds = [...new Set(rows.map((r) => r.to_user))];
      const profiles = otherIds.length
        ? await q<Pick<Profile, 'id' | 'display_name'>[]>(
            supabase.from('profiles').select('id, display_name').in('id', otherIds),
          )
        : [];
      const nameById = new Map(profiles.map((p) => [p.id, p.display_name]));
      return rows
        .filter((r) => r.owed_poisha !== 0)
        .map((r) => ({
          otherId: r.to_user,
          // from_user=me, owed_poisha>0 means I owe them; UI wants + = they owe me
          poisha: -r.owed_poisha,
          name: nameById.get(r.to_user) ?? FORMER_MEMBER,
        }))
        .sort((a, b) => Math.abs(b.poisha) - Math.abs(a.poisha));
    },
  });
}

/** People I can pick for a new claim (shared group, or existing ledger pair). */
export function useClaimPeers() {
  const me = useMe();
  return useQuery({
    queryKey: ['claimPeers', me],
    queryFn: async () => {
      const memberships = await q<{ group_id: string }[]>(
        supabase.from('group_members').select('group_id').eq('user_id', me),
      );
      const groupIds = memberships.map((m) => m.group_id);
      const peerRows = groupIds.length
        ? await q<{ user_id: string; profiles: Pick<Profile, 'id' | 'display_name'> | null }[]>(
            supabase
              .from('group_members')
              .select('user_id, profiles(id, display_name)')
              .in('group_id', groupIds)
              .neq('user_id', me),
          )
        : [];
      const pairs = await q<{ to_user: string }[]>(
        supabase.from('v_global_pairwise_net').select('to_user').eq('from_user', me),
      );
      const pairIds = pairs.map((p) => p.to_user);
      const pairProfiles = pairIds.length
        ? await q<Pick<Profile, 'id' | 'display_name'>[]>(
            supabase.from('profiles').select('id, display_name').in('id', pairIds),
          )
        : [];

      const map = new Map<string, string>();
      for (const r of peerRows) {
        if (r.profiles) map.set(r.profiles.id, r.profiles.display_name);
      }
      for (const p of pairProfiles) map.set(p.id, p.display_name);
      return [...map.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}
