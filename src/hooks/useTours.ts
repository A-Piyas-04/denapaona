import { useQuery } from '@tanstack/react-query';
import { useMe } from './useAuth';
import { buildTourHistory } from '@/lib/tourHistory';
import { coercePaisa } from '@/lib/tourMoney';
import { tourRpc, type TourBalancesRaw, type TourManageRaw } from '@/lib/tourRpc';
import {
  buildUserLists,
  settle,
  type ExpenseInput,
  type SplitMode,
} from '@/lib/tourSettlement';

export interface BalanceRow {
  userId: string;
  name: string;
  paisa: number;
}

export interface TourBalancesView {
  tourId: string;
  tourName: string;
  userName: string;
  role: 'owner' | 'leader' | 'member';
  give: BalanceRow[];
  get: BalanceRow[];
  totalGive: number;
  totalGet: number;
}

export interface ManageExpense {
  id: string;
  title: string;
  amountPaisa: number;
  participantCount: number;
  payerSummary: string;
  createdAt: string;
  splitMode: SplitMode;
  bills: { userId: string; name: string; paisa: number }[];
}

function toExpenseInputs(raw: TourBalancesRaw): ExpenseInput[] {
  return (raw.expenses ?? []).map((r) => {
    const split_mode: SplitMode = r.split_mode === 'individual' ? 'individual' : 'equal';
    return {
      participant_ids: r.participant_ids,
      amount_paisa: coercePaisa(r.amount_paisa),
      contributions: (r.contributions ?? []).map((c) => ({
        user_id: c.user_id,
        amount_paisa: coercePaisa(c.amount_paisa),
      })),
      split_mode,
      shares:
        split_mode === 'individual'
          ? (r.shares ?? []).map((s) => ({
              user_id: s.user_id,
              amount_paisa: coercePaisa(s.amount_paisa),
            }))
          : undefined,
    };
  });
}

export function computeTourBalances(raw: TourBalancesRaw, userId: string): TourBalancesView {
  const nameById = new Map(raw.members.map((m) => [m.userId, m.name]));
  const label = (id: string) => nameById.get(id) ?? 'Former member';
  const lists = buildUserLists(settle(toExpenseInputs(raw)), userId);
  return {
    tourId: raw.tourId,
    tourName: raw.tourName,
    userName: raw.userName,
    role: raw.role,
    give: lists.give.map((r) => ({ userId: r.userId, name: label(r.userId), paisa: r.paisa })),
    get: lists.get.map((r) => ({ userId: r.userId, name: label(r.userId), paisa: r.paisa })),
    totalGive: lists.totalGive,
    totalGet: lists.totalGet,
  };
}

function shapeManage(raw: TourManageRaw) {
  const nameById = new Map(raw.members.map((m) => [m.userId, m.name]));
  const expenses: ManageExpense[] = (raw.expenses ?? []).map((e) => {
    const splitMode: SplitMode = e.splitMode === 'individual' ? 'individual' : 'equal';
    const payerSummary = (e.contributions ?? [])
      .map((c) => nameById.get(c.user_id) ?? 'Former member')
      .join(', ');
    const bills =
      splitMode === 'individual'
        ? (e.shares ?? [])
            .map((s) => ({
              userId: s.userId,
              name: nameById.get(s.userId) ?? 'Former member',
              paisa: coercePaisa(s.amount_paisa),
            }))
            .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
        : [];
    return {
      id: e.id,
      title: e.title,
      amountPaisa: coercePaisa(e.amountPaisa),
      participantCount: e.participantCount,
      payerSummary,
      createdAt: e.createdAt,
      splitMode,
      bills,
    };
  });
  return { ...raw, expenses };
}

export function useMyTours() {
  const me = useMe();
  return useQuery({
    queryKey: ['tours', me],
    queryFn: () => tourRpc.listMine(),
  });
}

export function useTourBalances(tourId: string) {
  const me = useMe();
  return useQuery({
    queryKey: ['tour', tourId, 'balances', me],
    enabled: !!tourId,
    refetchInterval: () => (document.visibilityState === 'visible' ? 20_000 : false),
    queryFn: async () => {
      const raw = await tourRpc.getBalances(tourId);
      return computeTourBalances(raw, me);
    },
  });
}

export function useTourManage(tourId: string) {
  const me = useMe();
  return useQuery({
    queryKey: ['tour', tourId, 'manage', me],
    enabled: !!tourId,
    queryFn: async () => shapeManage(await tourRpc.getManage(tourId)),
  });
}

export function useTourHistory(tourId: string) {
  const me = useMe();
  return useQuery({
    queryKey: ['tour', tourId, 'history', me],
    enabled: !!tourId,
    queryFn: async () => buildTourHistory(await tourRpc.getHistory(tourId)),
  });
}
