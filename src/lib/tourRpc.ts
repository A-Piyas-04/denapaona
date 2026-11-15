/**
 * Typed wrappers for tour side-feature RPCs. Identity comes from the JWT only.
 */
import { supabase } from './supabase';
import { AppError, toAppError } from './errors';
import type { UUID } from './types';
import type { Contribution, SplitMode } from './tourSettlement';
import type { TourHistoryRaw } from './tourHistory';

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  try {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw error;
    return data as T;
  } catch (e) {
    throw toAppError(e);
  }
}

export interface MyTour {
  id: string;
  name: string;
  role: 'owner' | 'leader' | 'member';
}

export interface TourMember {
  userId: string;
  name: string;
  role: 'owner' | 'leader' | 'member';
}

export interface TourExpenseRow {
  id: string;
  title: string;
  amount_paisa: number | string;
  participant_ids: string[];
  contributions: Contribution[];
  created_by: string;
  created_at: string;
  split_mode?: SplitMode | null;
  shares?: Contribution[] | null;
}

export interface TourBalancesRaw {
  tourId: string;
  tourName: string;
  userName: string;
  role: 'owner' | 'leader' | 'member';
  members: TourMember[];
  expenses: TourExpenseRow[];
}

export interface ManageExpenseRaw {
  id: string;
  title: string;
  amountPaisa: number | string;
  participantCount: number;
  createdAt: string;
  splitMode: SplitMode;
  contributions: Contribution[];
  participant_ids: string[];
  shares: { userId: string; amount_paisa: number | string }[];
}

export interface TourManageRaw {
  tourId: string;
  tourName: string;
  joinCode: string;
  isOwner: boolean;
  members: TourMember[];
  expenses: ManageExpenseRaw[];
}

export const tourRpc = {
  create: (name: string, joinCode: string) =>
    call<UUID>('tour_create', { p_name: name, p_join_code: joinCode }),

  join: (joinCode: string) => call<UUID>('tour_join', { p_join_code: joinCode }),

  listMine: async () => {
    const data = await call<MyTour[]>('tour_list_mine');
    return data ?? [];
  },

  getBalances: (tourId: string) =>
    call<TourBalancesRaw>('tour_get_balances', { p_tour_id: tourId }),

  getManage: (tourId: string) =>
    call<TourManageRaw>('tour_get_manage', { p_tour_id: tourId }),

  getHistory: (tourId: string) =>
    call<TourHistoryRaw>('tour_get_history', { p_tour_id: tourId }),

  addExpense: (a: {
    tourId: string;
    title: string;
    amountPaisa: number;
    participantIds: string[];
    contributions: Contribution[];
    splitMode: SplitMode;
    shares?: Contribution[];
  }) =>
    call<UUID>('tour_add_expense', {
      p_tour_id: a.tourId,
      p_title: a.title,
      p_amount_paisa: a.amountPaisa,
      p_participant_ids: a.participantIds,
      p_contributions: a.contributions,
      p_split_mode: a.splitMode,
      p_shares: a.shares ?? null,
    }),

  deleteExpense: (tourId: string, expenseId: string) =>
    call<void>('tour_delete_expense', { p_tour_id: tourId, p_expense_id: expenseId }),

  setLeaderRole: (tourId: string, userId: string, isLeader: boolean) =>
    call<void>('tour_set_leader_role', {
      p_tour_id: tourId,
      p_user_id: userId,
      p_is_leader: isLeader,
    }),
};

export function tourErrorMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  return toAppError(err).message;
}
