import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toAppError } from '@/lib/errors';
import type { Group, Proposal } from '@/lib/types';
import { useMe } from './useAuth';

export type InboxItem = Proposal & { groups: Pick<Group, 'id' | 'name'> };

/**
 * Story C-04: proposals awaiting MY decision.  This count is the inbox badge —
 * the baseline notification mechanism (§13.3), authoritative even when push
 * is unavailable (G-01#3).
 */
export function useInbox() {
  const me = useMe();
  return useQuery({
    queryKey: ['inbox', me],
    refetchInterval: 60_000, // expiry happens on the server clock; keep the list honest
    queryFn: async () => {
      const { data: mine, error: e1 } = await supabase
        .from('proposal_participants').select('proposal_id').eq('user_id', me).eq('decision', 'pending');
      if (e1) throw toAppError(e1);
      const ids = (mine ?? []).map((r) => r.proposal_id as string);
      if (ids.length === 0) return [] as InboxItem[];
      const { data, error } = await supabase
        .from('proposals').select('*, proposal_participants(*), groups(id, name)')
        .in('id', ids).eq('status', 'pending').gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });
      if (error) throw toAppError(error);
      return data as InboxItem[];
    },
  });
}

/** Pending proposals I sent, so I can see who they're waiting on (C-05). */
export function useSentPending() {
  const me = useMe();
  return useQuery({
    queryKey: ['sent', me],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals').select('*, proposal_participants(*), groups(id, name)')
        .eq('proposer_id', me).eq('status', 'pending').order('created_at', { ascending: false });
      if (error) throw toAppError(error);
      return data as InboxItem[];
    },
  });
}

export function useProposal(id: string) {
  return useQuery({
    queryKey: ['proposal', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals').select('*, proposal_participants(*), groups(id, name)').eq('id', id).single();
      if (error) throw toAppError(error);
      return data as InboxItem;
    },
  });
}

export function useGroupPending(groupId: string) {
  return useQuery({
    queryKey: ['proposals', groupId, 'pending'],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals').select('*, proposal_participants(*)')
        .eq('group_id', groupId).eq('status', 'pending').order('created_at', { ascending: false });
      if (error) throw toAppError(error);
      return data as Proposal[];
    },
  });
}
