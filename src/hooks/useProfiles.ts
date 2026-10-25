import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { FORMER_MEMBER } from '@/lib/format';
import type { Profile } from '@/lib/types';
import { useMe } from './useAuth';

/**
 * Names for a set of ids across groups (inbox, proposal detail).  RLS only
 * returns people who share a group with the viewer; anyone else is
 * "(former member)".
 */
export function useProfileNames(ids: string[]) {
  const me = useMe();
  const key = [...new Set(ids)].sort();
  const q = useQuery({
    queryKey: ['profiles', key],
    enabled: key.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, display_name, avatar_url').in('id', key);
      return new Map((data as Profile[] | null ?? []).map((p) => [p.id, p.display_name]));
    },
  });
  return (id: string, opts: { you?: boolean } = {}) =>
    opts.you && id === me ? 'You' : q.data?.get(id) ?? (q.isLoading ? '…' : FORMER_MEMBER);
}
