/**
 * Every error has a defined user-visible message (USER_STORIES §1).  The
 * database raises stable codes (`raise exception 'CODE'`); this maps them to
 * the wording the stories specify.  An error the user cannot act on is a bug.
 */
import { formatTaka } from './money';

export class AppError extends Error {
  constructor(public code: string, message: string, public detail?: string) {
    super(message);
  }
}

const MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: 'Your session ended. Please sign in again.',
  NOT_A_MEMBER: "You're not a member of this group.",
  GROUP_NAME_REQUIRED: 'Give your group a name.',
  INVALID_INVITE_CODE: 'This invite link is no longer valid. Ask for a new one.',
  NOT_A_GROUP_OWNER: 'Only the group owner can do that.',
  LAST_OWNER_MUST_TRANSFER_OWNERSHIP: "You're the only owner. Hand ownership to someone else first.",

  INVALID_AMOUNT: 'Enter an amount.',
  DESCRIPTION_REQUIRED: 'Add a description so it can be checked later.',
  PAYER_NOT_A_MEMBER: 'The person who paid isn’t in this group.',
  SHARE_USER_NOT_A_MEMBER: 'Someone in this split is no longer in the group.',
  NEGATIVE_SHARE: 'A share can’t be negative.',
  SHARES_DO_NOT_SUM_TO_TOTAL: 'The shares don’t add up to the total.',
  NEEDS_ANOTHER_PARTICIPANT: 'An expense needs at least one other person.',

  PROPOSER_NOT_INVOLVED: 'You can only propose changes that involve you.',
  PARTIES_MUST_BE_DISTINCT: 'Pick three different people.',
  PARTIES_MUST_DIFFER: 'Pick two different people.',
  ALL_PARTIES_MUST_BE_MEMBERS: 'Everyone involved must be in this group.',
  DEBTOR_LEG_INSUFFICIENT: 'That’s more than they’re supposed to give you.',
  INTERMEDIARY_LEG_INSUFFICIENT: 'That’s more than you need to give them.',
  SETTLEMENT_EXCEEDS_BALANCE: 'That’s more than the balance.',
  DECREASE_EXCEEDS_BALANCE: 'That reduction is more than the current balance.',
  INVALID_DIRECTION: 'Choose whether the balance goes up or down.',
  PROPOSAL_RATE_LIMIT: 'You’ve sent several proposals recently. Give it some time.',
  PROPOSAL_NOT_FOUND: 'That proposal doesn’t exist, or you can’t see it.',
  PROPOSAL_NOT_PENDING: 'This has already been resolved.',
  NOT_A_PENDING_PARTICIPANT: 'You’ve already responded to this, or it doesn’t need you.',
  CANNOT_CANCEL: 'Only the person who proposed this can withdraw it, and only while it’s pending.',

  EXPENSE_NOT_FOUND: 'That expense doesn’t exist, or you can’t see it.',
  VOID_REASON_REQUIRED: 'Give a reason for cancelling.',
  ALREADY_VOIDED: 'This expense was already cancelled.',
  VOID_ALREADY_PROPOSED: 'A cancellation is already waiting for approval.',
  NOT_INVOLVED_IN_EXPENSE: 'Only the payer or someone in the split can propose cancelling this.',

  TOUR_NOT_A_MEMBER: "You're not a member of this tour.",
  TOUR_NOT_A_LEADER: 'Only a tour leader can do that.',
  TOUR_NOT_OWNER: 'Only the tour creator can do that.',
  TOUR_NOT_FOUND: 'Tour not found.',
  TOUR_NAME_INVALID: 'Tour name must be 1–60 characters.',
  TOUR_PIN_INVALID: 'Join PIN must be exactly 8 digits.',
  TOUR_PIN_IN_USE: 'That join PIN is already in use. Choose another.',
  TOUR_PIN_NOT_FOUND: 'No tour matches that PIN.',
  TOUR_TITLE_INVALID: 'Title is required (max 100 characters).',
  TOUR_AMOUNT_INVALID: 'Enter a valid amount greater than zero.',
  TOUR_PARTICIPANTS_REQUIRED: 'Select at least one participant.',
  TOUR_DUPLICATE_PARTICIPANT: 'Duplicate participants are not allowed.',
  TOUR_PARTICIPANT_NOT_MEMBER: 'A participant is not a member of this tour.',
  TOUR_PAYERS_REQUIRED: 'Add at least one payer.',
  TOUR_DUPLICATE_PAYER: 'Each payer may appear only once.',
  TOUR_PAYER_NOT_MEMBER: 'A payer is not a member of this tour.',
  TOUR_PAID_MISMATCH: 'The paid total must equal the expense total exactly.',
  TOUR_SHARES_REQUIRED: 'Enter a bill for every selected participant.',
  TOUR_DUPLICATE_SHARE: 'Each participant may have only one bill.',
  TOUR_SHARE_NOT_PARTICIPANT: 'A bill was entered for someone who is not a participant.',
  TOUR_SHARE_MISSING: 'Enter a bill for every selected participant.',
  TOUR_SHARES_MISMATCH: 'The individual bills must add up to the expense total.',
  TOUR_OWNER_ROLE_FIXED: "The owner's role cannot be changed.",
  TOUR_MEMBER_NOT_FOUND: 'That member is not in this tour.',
  TOUR_SPLIT_MODE_INVALID: 'Choose equal split or individual bills.',

  INVALID_CLAIM_INVITE: 'This claim invite is no longer valid.',
  CLAIM_INVITE_USED: 'This claim invite was already used or has expired.',
};

/** Pull the stable code out of a Postgres error ("CODE: detail"). */
function extractCode(message: string): { code: string; detail?: string } {
  const m = /^([A-Z][A-Z_]{3,})(?::\s*(.*))?$/.exec(message.trim());
  return m ? { code: m[1]!, detail: m[2] } : { code: 'UNKNOWN', detail: message };
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const raw =
    typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err);

  if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(raw)) {
    return new AppError('NETWORK', 'Couldn’t reach the server. Check your connection and try again.');
  }
  if (/JWT expired|invalid JWT/i.test(raw)) {
    return new AppError('AUTH_REQUIRED', MESSAGES.AUTH_REQUIRED!);
  }

  const { code, detail } = extractCode(raw);
  if (code === 'OUTSTANDING_BALANCE') {
    // detail is the member's net: negative means they still need to give.
    const net = Number(detail ?? 0);
    const msg =
      net < 0
        ? `Settle up before leaving. You still need to give ${formatTaka(-net)}.`
        : `Settle up before leaving. You’re still supposed to get ${formatTaka(net)}.`;
    return new AppError(code, msg, detail);
  }
  return new AppError(code, MESSAGES[code] ?? 'Something went wrong. Please try again.', detail);
}

export function errorMessage(err: unknown): string {
  return toAppError(err).message;
}

/** Plain-language outcome of a proposal; never a raw status string (§13.3). */
export function proposalOutcome(status: string, type: string): string {
  switch (status) {
    case 'pending':
      return 'Waiting for approval';
    case 'approved':
      return 'Approved by everyone';
    case 'rejected':
      return 'Declined. Nothing changed.';
    case 'expired':
      return 'This expired before everyone responded';
    case 'cancelled':
      return 'Withdrawn by the person who proposed it';
    case 'invalidated':
      return type === 'void'
        ? 'This expense was already cancelled'
        : 'No longer possible. The debt changed after this was sent.';
    default:
      return status;
  }
}
