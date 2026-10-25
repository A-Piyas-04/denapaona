import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toAppError } from '@/lib/errors';
import { FORMER_MEMBER } from '@/lib/format';
import type { Group, GroupMember, PairwiseNet, Profile, UserNet } from '@/lib/types';
import { useMe } from './useAuth';

async function q<T>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw toAppError(error);
  return data as T;
}

export interface MyGroup extends Group {
  role: GroupMember['role'];
  netPoisha: number;
  lastActivity: string;
}

/** Story A-04: every group, my net in each, most-recent-activity first. */
export function useMyGroups() {
  const me = useMe();
  return useQuery({
    queryKey: ['groups', me],
    queryFn: async (): Promise<MyGroup[]> => {
      const rows = await q<{ role: GroupMember['role']; groups: Group }[]>(
        supabase.from('group_members').select('role, groups(*)').eq('user_id', me),
      );
      const nets = await q<UserNet[]>(supabase.from('v_user_net').select('*').eq('user_id', me));
      const recent = await q<{ group_id: string; created_at: string }[]>(
        supabase.from('ledger_entries').select('group_id, created_at').order('created_at', { ascending: false }).limit(1000),
      );
      const last = new Map<string, string>();
      for (const r of recent) if (!last.has(r.group_id)) last.set(r.group_id, r.created_at);
      return rows
        .map((r) => ({
          ...r.groups,
          role: r.role,
          netPoisha: nets.find((n) => n.group_id === r.groups.id)?.net_poisha ?? 0,
          lastActivity: last.get(r.groups.id) ?? r.groups.created_at,
        }))
        .sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1));
    },
  });
}

export function useGroup(groupId: string) {
  return useQuery({
    queryKey: ['group', groupId],
    enabled: !!groupId,
    queryFn: () => q<Group>(supabase.from('groups').select('*').eq('id', groupId).single()),
  });
}

export interface Member extends GroupMember { profile: Profile }

export function useMembers(groupId: string) {
  return useQuery({
    queryKey: ['members', groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<Member[]> => {
      const rows = await q<(GroupMember & { profiles: Profile })[]>(
        supabase.from('group_members').select('*, profiles(*)').eq('group_id', groupId),
      );
      return rows
        .map(({ profiles, ...m }) => ({ ...m, profile: profiles }))
        .sort((a, b) => a.profile.display_name.localeCompare(b.profile.display_name));
    },
  });
}

/**
 * Names for every id that might appear in a group's history.  Anyone who has
 * left — and so no longer shares a group with the viewer — is invisible to the
 * profiles RLS policy, and renders as "(former member)" (story B-04#4).
 */
export function useNames(groupId: string) {
  const members = useMembers(groupId);
  const map = new Map<string, string>();
  for (const m of members.data ?? []) map.set(m.user_id, m.profile.display_name);
  const me = useMe();
  return {
    ...members,
    name: (id: string | null | undefined, opts: { you?: boolean } = {}) =>
      !id ? FORMER_MEMBER : opts.you && id === me ? 'You' : map.get(id) ?? FORMER_MEMBER,
  };
}

export function useGroupNets(groupId: string) {
  return useQuery({
    queryKey: ['nets', groupId],
    enabled: !!groupId,
    queryFn: () => q<UserNet[]>(supabase.from('v_user_net').select('*').eq('group_id', groupId)),
  });
}

/**
 * Story B-04: my pairwise balances.  `owed_poisha > 0` means I owe that person;
 * `< 0` means they owe me.  The headline is the sum of these same integers, so
 * it cannot drift from the breakdown (B-04#3).
 */
export function useMyPairwise(groupId: string) {
  const me = useMe();
  return useQuery({
    queryKey: ['pairwise', groupId, me],
    enabled: !!groupId,
    queryFn: () =>
      q<PairwiseNet[]>(
        supabase.from('v_pairwise_net').select('*').eq('group_id', groupId).eq('from_user', me).neq('owed_poisha', 0),
      ),
  });
}
