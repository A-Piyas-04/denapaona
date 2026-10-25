import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toAppError } from '@/lib/errors';
import { rpc } from '@/lib/rpc';
import type { Trip, TripLeader, TripLeaderLog, TripPreset } from '@/lib/types';

export function useTrips(groupId: string) {
  return useQuery({
    queryKey: ['trips', groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trips').select('*').eq('group_id', groupId).order('started_on', { ascending: false });
      if (error) throw toAppError(error);
      return data as Trip[];
    },
  });
}

export interface TripBundle {
  trip: Trip;
  memberIds: string[];
  leaders: TripLeader[];
  log: TripLeaderLog[];
  presets: TripPreset[];
}

export function useTrip(tripId: string) {
  return useQuery({
    queryKey: ['trip', tripId],
    enabled: !!tripId,
    queryFn: async (): Promise<TripBundle> => {
      const [t, m, l, log, p] = await Promise.all([
        supabase.from('trips').select('*').eq('id', tripId).single(),
        supabase.from('trip_members').select('user_id').eq('trip_id', tripId),
        supabase.from('trip_leaders').select('*').eq('trip_id', tripId),
        supabase.from('trip_leader_log').select('*').eq('trip_id', tripId).order('created_at', { ascending: false }),
        supabase.from('trip_presets').select('*').eq('trip_id', tripId),
      ]);
      for (const r of [t, m, l, log, p]) if (r.error) throw toAppError(r.error);
      return {
        trip: t.data as Trip,
        memberIds: (m.data as { user_id: string }[]).map((r) => r.user_id),
        leaders: l.data as TripLeader[],
        log: log.data as TripLeaderLog[],
        presets: p.data as TripPreset[],
      };
    },
  });
}

export function useTripNets(tripId: string) {
  return useQuery({ queryKey: ['tripNets', tripId], enabled: !!tripId, queryFn: () => rpc.tripNetPositions(tripId) });
}

/**
 * Cosmetic only.  Hiding a control from a non-leader is a courtesy so nobody
 * taps a button that errors (§13.3); the refusal itself happens in Postgres
 * (is_trip_leader, §11.6).
 */
export function isLeaderNow(bundle: TripBundle | undefined, userId: string): boolean {
  return !!bundle && bundle.trip.status === 'active' && bundle.leaders.some((l) => l.user_id === userId);
}
