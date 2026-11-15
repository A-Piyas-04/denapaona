import { describe, expect, it } from 'vitest';
import { buildUserLists, settle, type ExpenseInput } from './tourSettlement';

/** Required blueprint example: breakfast + auto-rickshaw → B owes A ৳90. */
describe('tourSettlement pairwise cancellation', () => {
  const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const ids = [
    A, B,
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333',
    '44444444-4444-4444-4444-444444444444',
  ];

  it('breakfast: A pays ৳1000 for 10 → each other owes A ৳100', () => {
    const breakfast: ExpenseInput = {
      participant_ids: ids,
      amount_paisa: 100_000,
      contributions: [{ user_id: A, amount_paisa: 100_000 }],
      split_mode: 'equal',
    };
    const lists = buildUserLists(settle([breakfast]), B);
    expect(lists.give).toEqual([{ userId: A, paisa: 10_000 }]);
    expect(lists.get).toEqual([]);
  });

  it('after auto-rickshaw, B owes A ৳90 (pairwise cancel)', () => {
    const breakfast: ExpenseInput = {
      participant_ids: ids,
      amount_paisa: 100_000,
      contributions: [{ user_id: A, amount_paisa: 100_000 }],
      split_mode: 'equal',
    };
    const rideParticipants = ids.slice(0, 6); // A, B, and four others
    const ride: ExpenseInput = {
      participant_ids: rideParticipants,
      amount_paisa: 6_000,
      contributions: [{ user_id: B, amount_paisa: 6_000 }],
      split_mode: 'equal',
    };
    const transfers = settle([breakfast, ride]);
    const aLists = buildUserLists(transfers, A);
    const bLists = buildUserLists(transfers, B);

    expect(aLists.give.find((r) => r.userId === B)).toBeUndefined();
    expect(bLists.give).toContainEqual({ userId: A, paisa: 9_000 });
    expect(aLists.get).toContainEqual({ userId: B, paisa: 9_000 });
  });

  it('individual bills use entered shares verbatim', () => {
    const exp: ExpenseInput = {
      participant_ids: [A, B],
      amount_paisa: 15_000,
      contributions: [{ user_id: A, amount_paisa: 15_000 }],
      split_mode: 'individual',
      shares: [
        { user_id: A, amount_paisa: 5_000 },
        { user_id: B, amount_paisa: 10_000 },
      ],
    };
    const lists = buildUserLists(settle([exp]), B);
    expect(lists.give).toEqual([{ userId: A, paisa: 10_000 }]);
  });
});
