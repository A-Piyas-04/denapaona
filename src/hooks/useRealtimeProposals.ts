import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * §13.4 — live approval state.  Realtime is a convenience, never a correctness
 * mechanism: if the socket drops, TanStack Query's refetch-on-focus is the
 * fallback (story C-04#4), and every decision is re-checked by the database.
 */
export function useRealtimeGroup(groupId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!groupId) return;
    const refresh = () =>
      qc.invalidateQueries({
        predicate: (q) =>
          q.queryKey.includes(groupId) ||
          ['inbox', 'sent', 'groups', 'proposal', 'trip', 'tripNets', 'explain', 'expense'].includes(String(q.queryKey[0])),
      });
    const ch = supabase.channel(`group:${groupId}`);
    for (const table of ['proposals', 'ledger_entries', 'expenses']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `group_id=eq.${groupId}` }, refresh);
    }
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [groupId, qc]);
}

/** The inbox badge stays live wherever the user is (G-01). */
export function useRealtimeInbox(userId: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`inbox:${userId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'proposal_participants', filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ['inbox', userId] }))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'proposals' },
        () => {
          qc.invalidateQueries({ queryKey: ['inbox', userId] });
          qc.invalidateQueries({ queryKey: ['proposal'] });
          qc.invalidateQueries({ queryKey: ['sent', userId] });
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, qc]);
}
