/**
 * Row types mirroring supabase/migrations.  Hand-maintained; regenerate with
 *   npx supabase gen types typescript --linked > src/lib/database.types.ts
 * and narrow from there if the schema grows.  Amounts are integer poisha.
 */
export type UUID = string;

export interface Profile {
  id: UUID;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
}

export interface Group {
  id: UUID;
  name: string;
  created_by: UUID;
  invite_code: string;
  created_at: string;
}

export interface GroupMember {
  group_id: UUID;
  user_id: UUID;
  role: 'owner' | 'member';
  joined_at: string;
}

export type TripStatus = 'active' | 'closed';
export type EntryMode = 'leaders_only' | 'open';

export interface Trip {
  id: UUID;
  group_id: UUID;
  name: string;
  started_on: string;
  ended_on: string | null;
  status: TripStatus;
  entry_mode: EntryMode;
  created_by: UUID;
  created_at: string;
}

export interface TripLeader {
  trip_id: UUID;
  user_id: UUID;
  appointed_by: UUID;
  appointed_at: string;
}

export interface TripLeaderLog {
  id: UUID;
  trip_id: UUID;
  user_id: UUID;
  action: 'appointed' | 'removed' | 'trip_closed' | 'trip_reopened';
  actor_id: UUID;
  created_at: string;
}

export interface TripPreset {
  id: UUID;
  trip_id: UUID;
  label: string;
  user_ids: UUID[];
}

export interface ExpenseShare {
  expense_id: UUID;
  user_id: UUID;
  share_poisha: number;
}

export interface EntryDispute {
  id: UUID;
  expense_id: UUID;
  raised_by: UUID;
  reason: string;
  status: 'open' | 'resolved' | 'withdrawn';
  created_at: string;
}

export interface Expense {
  id: UUID;
  group_id: UUID;
  trip_id: UUID | null;
  payer_id: UUID;
  total_poisha: number;
  description: string;
  created_by: UUID;
  created_at: string;
  voided_at: string | null;
  voided_by: UUID | null;
  void_reason: string | null;
  expense_shares?: ExpenseShare[];
  entry_disputes?: EntryDispute[];
}

export interface LedgerEntry {
  id: UUID;
  group_id: UUID;
  trip_id: UUID | null;
  from_user: UUID;
  to_user: UUID;
  amount_poisha: number;
  source_type: 'expense' | 'proposal';
  source_id: UUID;
  created_at: string;
}

export type ProposalType = 'transfer' | 'amendment' | 'settlement' | 'void';
export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'invalidated' | 'cancelled';
export type Decision = 'pending' | 'approved' | 'rejected';

export interface TransferPayload { debtor: UUID; intermediary: UUID; creditor: UUID; amount: number }
export interface AmendmentPayload { from_user: UUID; to_user: UUID; amount: number; direction: 'increase' | 'decrease'; trip_id?: UUID | null }
export interface SettlementPayload { debtor: UUID; creditor: UUID; amount: number; trip_id?: UUID | null; leader_recorded?: boolean }
export interface VoidPayload { expense_id: UUID; trip_id: UUID | null }

export interface ProposalParticipant {
  proposal_id: UUID;
  user_id: UUID;
  decision: Decision;
  decided_at: string | null;
}

export interface Proposal {
  id: UUID;
  group_id: UUID;
  type: ProposalType;
  proposer_id: UUID;
  payload: TransferPayload | AmendmentPayload | SettlementPayload | VoidPayload;
  note: string | null;
  status: ProposalStatus;
  expires_at: string;
  resolved_at: string | null;
  resolution_reason: string | null;
  created_at: string;
  proposal_participants?: ProposalParticipant[];
}

export interface UserNet { group_id: UUID; user_id: UUID; net_poisha: number }
export interface PairwiseNet { group_id: UUID; from_user: UUID; to_user: UUID; owed_poisha: number }
export interface TripNetPosition { user_id: UUID; display_name: string; net_poisha: number }

export interface DerivationRow {
  entry_id: UUID;
  occurred_at: string;
  signed_poisha: number;
  running_poisha: number;
  cause_type: 'expense' | 'void' | 'proposal';
  cause_label: string;
  detail: {
    expense_id?: UUID;
    proposal_id?: UUID;
    rounding_note?: string | null;
    split_kind?: 'even' | 'rounding' | 'manual';
    got_extra_poisha?: boolean;
    entered_by_leader?: boolean;
    open_disputes?: number;
    leader_recorded?: boolean;
    note?: string | null;
    trip_id?: UUID | null;
    [k: string]: unknown;
  };
}
