/**
 * Typed wrappers over the RPC layer (DEVELOPMENT_PLAN.md §11).
 *
 * The browser only ASKS (principle P3).  No function here passes the caller's
 * identity — the database takes it from the verified JWT (principle P4).  Any
 * check the UI performs before calling these is a convenience; the database
 * re-checks everything.
 */
import { supabase } from './supabase';
import { AppError, toAppError } from './errors';
import type { DerivationRow, EntryMode, TripNetPosition, UUID } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * USER_STORIES §12.1: a timed-out request retries with backoff, up to three
 * attempts.  Only for calls that are safe to repeat — reads, and writes that
 * are idempotent (add_expense carries a client token).  Domain errors are never
 * retried; only network failures are.
 */
async function call<T>(fn: string, args: Record<string, unknown>, opts: { retry?: boolean } = {}): Promise<T> {
  const attempts = opts.retry ? 3 : 1;
  let last: AppError | undefined;
  for (let i = 0; i < attempts; i++) {
    try {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) throw error;
      return data as T;
    } catch (e) {
      last = toAppError(e);
      if (last.code !== 'NETWORK' || i === attempts - 1) throw last;
      await sleep(300 * 3 ** i);
    }
  }
  throw last!;
}

export interface ShareInput { user_id: UUID; share: number }

export const rpc = {
  // ── groups ──
  createGroup: (name: string) => call<UUID>('create_group', { p_name: name }),
  joinGroup: (code: string) => call<UUID>('join_group', { p_invite_code: code }),
  previewInvite: async (code: string) => {
    const rows = await call<{ group_id: UUID; group_name: string; member_count: number; already_member: boolean }[]>(
      'preview_invite', { p_invite_code: code }, { retry: true });
    if (!rows[0]) throw new AppError('INVALID_INVITE_CODE', 'This invite link is no longer valid. Ask for a new one.');
    return rows[0];
  },
  rotateInviteCode: (groupId: UUID) => call<string>('rotate_invite_code', { p_group_id: groupId }),
  leaveGroup: (groupId: UUID) => call<void>('leave_group', { p_group_id: groupId }),
  transferOwnership: (groupId: UUID, to: UUID) =>
    call<void>('transfer_group_ownership', { p_group_id: groupId, p_to: to }),

  // ── expenses ──
  addExpense: (a: {
    groupId: UUID; payerId: UUID; total: number; description: string;
    shares: ShareInput[]; tripId?: UUID | null; clientToken: UUID;
  }) =>
    call<UUID>('add_expense', {
      p_group_id: a.groupId, p_payer_id: a.payerId, p_total: a.total, p_description: a.description,
      p_shares: a.shares, p_trip_id: a.tripId ?? null, p_client_token: a.clientToken,
    }, { retry: true }),
  recentSimilarExpense: async (groupId: UUID, payerId: UUID, total: number) => {
    const rows = await call<{ id: UUID; description: string; created_at: string; created_by_name: string }[]>(
      'recent_similar_expense', { p_group_id: groupId, p_payer_id: payerId, p_total: total }, { retry: true });
    return rows[0] ?? null;
  },

  // ── proposals ──
  proposeTransfer: (a: { groupId: UUID; debtor: UUID; intermediary: UUID; creditor: UUID; amount: number; note?: string }) =>
    call<UUID>('propose_transfer', {
      p_group_id: a.groupId, p_debtor: a.debtor, p_intermediary: a.intermediary,
      p_creditor: a.creditor, p_amount: a.amount, p_note: a.note || null,
    }),
  proposeSettlement: (a: { groupId: UUID; debtor: UUID; creditor: UUID; amount: number; note?: string; tripId?: UUID | null }) =>
    call<UUID>('propose_settlement', {
      p_group_id: a.groupId, p_debtor: a.debtor, p_creditor: a.creditor, p_amount: a.amount,
      p_note: a.note || null, p_trip_id: a.tripId ?? null,
    }),
  proposeAmendment: (a: {
    groupId: UUID; fromUser: UUID; toUser: UUID; amount: number; direction: 'increase' | 'decrease'; note?: string;
  }) =>
    call<UUID>('propose_amendment', {
      p_group_id: a.groupId, p_from_user: a.fromUser, p_to_user: a.toUser, p_amount: a.amount,
      p_direction: a.direction, p_note: a.note || null, p_trip_id: null,
    }),
  respond: (proposalId: UUID, approve: boolean) =>
    call<'pending' | 'approved' | 'rejected' | 'expired' | 'invalidated'>('respond_to_proposal', {
      p_proposal_id: proposalId, p_approve: approve,
    }),
  cancelProposal: (proposalId: UUID) => call<void>('cancel_proposal', { p_proposal_id: proposalId }),
  netOwed: (groupId: UUID, debtor: UUID, creditor: UUID) =>
    call<number>('net_owed', { p_group: groupId, p_debtor: debtor, p_creditor: creditor }, { retry: true }),

  // ── trips ──
  createTrip: (a: { groupId: UUID; name: string; memberIds: UUID[]; leaderIds: UUID[]; entryMode: EntryMode }) =>
    call<UUID>('create_trip', {
      p_group_id: a.groupId, p_name: a.name, p_member_ids: a.memberIds,
      p_leader_ids: a.leaderIds, p_entry_mode: a.entryMode,
    }),
  closeTrip: (tripId: UUID) => call<void>('close_trip', { p_trip_id: tripId }),
  reopenTrip: (tripId: UUID) => call<void>('reopen_trip', { p_trip_id: tripId }),
  setEntryMode: (tripId: UUID, mode: EntryMode) => call<void>('set_trip_entry_mode', { p_trip_id: tripId, p_mode: mode }),
  tripNetPositions: (tripId: UUID) =>
    call<TripNetPosition[]>('trip_net_positions', { p_trip_id: tripId }, { retry: true }),
  addTripLeader: (tripId: UUID, userId: UUID) => call<void>('add_trip_leader', { p_trip_id: tripId, p_user: userId }),
  removeTripLeader: (tripId: UUID, userId: UUID) =>
    call<void>('remove_trip_leader', { p_trip_id: tripId, p_user: userId }),
  leaderRecordSettlement: (a: { tripId: UUID; debtor: UUID; creditor: UUID; amount: number; note?: string }) =>
    call<UUID>('leader_record_settlement', {
      p_trip_id: a.tripId, p_debtor: a.debtor, p_creditor: a.creditor, p_amount: a.amount, p_note: a.note || null,
    }),

  // ── corrections ──
  voidExpense: (expenseId: UUID, reason: string) =>
    call<void>('void_expense', { p_expense_id: expenseId, p_reason: reason }),
  proposeVoid: (expenseId: UUID, reason: string) =>
    call<UUID>('propose_void', { p_expense_id: expenseId, p_reason: reason }),
  raiseDispute: (expenseId: UUID, reason: string) =>
    call<UUID>('raise_dispute', { p_expense_id: expenseId, p_reason: reason }),
  withdrawDispute: (disputeId: UUID) => call<void>('withdraw_dispute', { p_dispute_id: disputeId }),

  // ── explanation ──
  explainBalance: (groupId: UUID, otherId: UUID, tripId?: UUID | null) =>
    call<DerivationRow[]>('explain_balance', {
      p_group_id: groupId, p_other: otherId, p_trip_id: tripId ?? null,
    }, { retry: true }),
};

export function newClientToken(): UUID {
  return crypto.randomUUID();
}

export interface Attribution {
  expense_id: UUID; entered_by_leader: boolean; voided_by_leader: boolean; voided_by_agreement: boolean;
}
export const fetchAttribution = (groupId: UUID, tripId?: UUID | null) =>
  call<Attribution[]>('expense_attribution', { p_group_id: groupId, p_trip_id: tripId ?? null }, { retry: true });
