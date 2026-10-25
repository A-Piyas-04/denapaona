#!/usr/bin/env node
/**
 * DEVELOPMENT_PLAN.md §12.7 — security acceptance tests, automated.
 * EVERY ATTACK MUST FAIL.  Run before any UI work and before every deploy.
 *
 * Works against a real Supabase project.  It needs three throwaway accounts
 * signed in to the deployed app; copy each one's access token from the browser
 * (DevTools → Application → Local Storage → sb-<ref>-auth-token → access_token):
 *
 *   HN_URL=https://<ref>.supabase.co HN_ANON_KEY=<anon key> \
 *   HN_TOKEN_A=... HN_TOKEN_B=... HN_TOKEN_C=... \
 *   node scripts/security-checklist.mjs
 *
 * A is the attacker.  B and C build a foreign group A must not reach, plus a
 * shared group with debts and trips for A to attack from the inside.  The
 * fixtures it creates are ordinary groups named "§12.7 …" and cannot be
 * deleted (the ledger is append-only); use throwaway accounts.
 */
import { createClient } from '@supabase/supabase-js';

const { HN_URL, HN_ANON_KEY, HN_TOKEN_A, HN_TOKEN_B, HN_TOKEN_C } = process.env;
if (!HN_URL || !HN_ANON_KEY || !HN_TOKEN_A || !HN_TOKEN_B || !HN_TOKEN_C) {
  console.error('Set HN_URL, HN_ANON_KEY, HN_TOKEN_A, HN_TOKEN_B, HN_TOKEN_C. See the header of this file.');
  process.exit(2);
}

const client = (token) => createClient(HN_URL, HN_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${token}` } },
});
const sub = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub;

const A = client(HN_TOKEN_A), B = client(HN_TOKEN_B), C = client(HN_TOKEN_C);
const a = sub(HN_TOKEN_A), b = sub(HN_TOKEN_B), c = sub(HN_TOKEN_C);

async function must(p, what) {
  const { data, error } = await p;
  if (error) throw new Error(`fixture step failed (${what}): ${error.message}`);
  return data;
}
const share = (user_id, s) => ({ user_id, share: s });

// ── fixtures ────────────────────────────────────────────────────────────────
const tag = new Date().toISOString().slice(0, 16);
const gF = await must(B.rpc('create_group', { p_name: `§12.7 foreign ${tag}` }), 'foreign group');
const codeF = (await must(B.from('groups').select('invite_code').eq('id', gF).single(), 'code')).invite_code;
await must(C.rpc('join_group', { p_invite_code: codeF }), 'C joins foreign');
await must(B.rpc('add_expense', { p_group_id: gF, p_payer_id: b, p_total: 5000, p_description: 'foreign', p_shares: [share(c, 5000)] }), 'foreign expense');
const tripF = await must(B.rpc('create_trip', { p_group_id: gF, p_name: 'foreign trip', p_member_ids: [c] }), 'foreign trip');

const gA = await must(A.rpc('create_group', { p_name: `§12.7 shared ${tag}` }), 'shared group');
const codeA = (await must(A.from('groups').select('invite_code').eq('id', gA).single(), 'code')).invite_code;
await must(B.rpc('join_group', { p_invite_code: codeA }), 'B joins');
await must(C.rpc('join_group', { p_invite_code: codeA }), 'C joins');
const ownExpense = await must(A.rpc('add_expense', { p_group_id: gA, p_payer_id: a, p_total: 3000, p_description: 'mine', p_shares: [share(b, 3000)] }), 'A expense');
const othersExpense = await must(B.rpc('add_expense', { p_group_id: gA, p_payer_id: b, p_total: 2000, p_description: 'not mine', p_shares: [share(c, 2000)] }), 'B expense');
const foreignProposal = await must(C.rpc('propose_settlement', { p_group_id: gA, p_debtor: c, p_creditor: b, p_amount: 1000 }), 'B/C proposal');
const tripLed = await must(A.rpc('create_trip', { p_group_id: gA, p_name: 'A leads', p_member_ids: [b] }), 'A trip');
const tripNotLed = await must(B.rpc('create_trip', { p_group_id: gA, p_name: 'B leads', p_member_ids: [a, c] }), 'B trip');
const anyEntry = (await must(A.from('ledger_entries').select('id').eq('group_id', gA).limit(1).single(), 'entry')).id;

// ── attacks, all as A ───────────────────────────────────────────────────────
const results = [];
async function attack(n, label, p, check) {
  const r = await p;
  const ok = check(r);
  results.push(ok);
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${n}. ${label}${ok ? '' : `  → ${JSON.stringify(r.error ?? r.data)}`}`);
}
const refused = (pattern) => (r) => !!r.error && pattern.test(r.error.message);
const empty = (r) => !r.error && Array.isArray(r.data) && r.data.length === 0;
const noRows = (r) => !!r.error || (Array.isArray(r.data) && r.data.length === 0) || r.count === 0;

console.log('§12.7 security acceptance tests — every attack must fail\n');
await attack(1, 'direct ledger insert', A.from('ledger_entries').insert({
  group_id: gA, from_user: b, to_user: a, amount_poisha: 9999999, source_type: 'expense', source_id: crypto.randomUUID(),
}), refused(/row-level security|permission denied/));
await attack(2, 'self-approve via proposal_participants', A.from('proposal_participants')
  .update({ decision: 'approved' }).eq('proposal_id', foreignProposal).select(), noRows);
await attack(3, 'mutate an existing ledger entry', A.from('ledger_entries')
  .update({ amount_poisha: 1 }).eq('id', anyEntry).select(), noRows);
await attack('3b', 'delete ledger entries', A.from('ledger_entries').delete().eq('group_id', gA).select(), noRows);
await attack(4, "read another group's ledger", A.from('ledger_entries').select('*').eq('group_id', gF), empty);
await attack('4b', "read another group's balances view", A.from('v_user_net').select('*').eq('group_id', gF), empty);
await attack('4c', "read another group's expenses", A.from('expenses').select('*').eq('group_id', gF), empty);
await attack('4d', 'net_owed on a foreign group', A.rpc('net_owed', { p_group: gF, p_debtor: c, p_creditor: b }), refused(/NOT_A_MEMBER/));
await attack(5, "approve on someone else's behalf", A.rpc('respond_to_proposal', { p_proposal_id: foreignProposal, p_approve: true }), refused(/NOT_A_PENDING_PARTICIPANT/));
await attack(6, 'add_expense in a foreign group', A.rpc('add_expense', {
  p_group_id: gF, p_payer_id: b, p_total: 100, p_description: 'x', p_shares: [], p_trip_id: null,
}), refused(/NOT_A_MEMBER/));
await attack(7, 'explain_balance in a foreign group', A.rpc('explain_balance', { p_group_id: gF, p_other: b, p_trip_id: null }), refused(/NOT_A_MEMBER/));
await attack(8, "tag an expense onto another group's trip", A.rpc('add_expense', {
  p_group_id: gA, p_payer_id: a, p_total: 100, p_description: 'x', p_shares: [share(b, 100)], p_trip_id: tripF,
}), refused(/TRIP_NOT_IN_GROUP/));
await attack(9, 'make yourself a trip leader', A.from('trip_leaders').insert({ trip_id: tripNotLed, user_id: a, appointed_by: a }),
  refused(/row-level security|permission denied/));
await attack('9b', 'add_trip_leader as a non-leader', A.rpc('add_trip_leader', { p_trip_id: tripNotLed, p_user: a }), refused(/NOT_A_TRIP_LEADER/));
await attack(10, 'leader settlement on a trip you do not lead', A.rpc('leader_record_settlement', {
  p_trip_id: tripNotLed, p_debtor: c, p_creditor: b, p_amount: 100, p_note: null,
}), refused(/NOT_A_TRIP_LEADER/));
await attack(11, 'void your own expense outside a trip', A.rpc('void_expense', { p_expense_id: ownExpense, p_reason: 'test' }), refused(/NOT_AUTHORIZED_TO_VOID/));
await attack('11b', 'propose a void you are not part of', A.rpc('propose_void', { p_expense_id: othersExpense, p_reason: 'test' }), refused(/NOT_INVOLVED_IN_EXPENSE/));
await attack(12, 'as a leader, settle more than the trip created', A.rpc('leader_record_settlement', {
  p_trip_id: tripLed, p_debtor: b, p_creditor: a, p_amount: 99999999, p_note: null,
}), refused(/EXCEEDS_TRIP_BALANCE/));

const failed = results.filter((x) => !x).length;
console.log(failed ? `\n${failed} ATTACK(S) SUCCEEDED — DO NOT DEPLOY.` : `\nAll ${results.length} attacks refused.`);
process.exit(failed ? 1 : 0);
