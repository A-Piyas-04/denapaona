# HishebNama — Implementation Notes

Companion to `DEVELOPMENT_PLAN.md` v1.3 and `USER_STORIES.md` v1.1.

The plan's §1 says: *"Where they appear to conflict, Sections 7, 8, 11, 12 and 14 here take precedence — say so rather than silently reconciling."* This file is where that is said. Every divergence below is also commented at the exact spot in the code (search for `DIVERGENCE`, `FIX vs`, `ADDITION`, `CONFLICT NOTED`).

---

## 1. Decisions that need the developer

These are places where the two documents disagree, and the plan was followed because it takes precedence. Each one deserves a deliberate decision.

| # | Where | The plan says | The stories say | What is implemented |
|---|---|---|---|---|
| 1 | §14.2, "same user calls `respond_to_proposal` twice" | The second call raises `NOT_A_PENDING_PARTICIPANT`. | C-02#5, same | That holds while the proposal is still pending. On a two-party proposal the first approval already resolves it, so §11.4's own check order raises `PROPOSAL_NOT_PENDING` instead. Either way the second call is refused and nothing is applied twice. |

---

## 2. Defects in the plan's SQL that were fixed

Each of these was found either by reading the plan against PostgreSQL semantics or by the test suite failing on the plan's code as written.

| # | Problem in the plan | Consequence if shipped as written | Fix |
|---|---|---|---|
| 1 | The `members_read` RLS policy on `group_members` contains a subquery on `group_members`. | PostgreSQL raises *"infinite recursion detected in policy"* on every read. Nearly every other policy joins `group_members`, so the whole app returns errors. | `security definer` helpers (`is_group_member`, `can_see_expense`, …). They take no user parameter, so they only ever answer for the caller. |
| 2 | `v_user_net` is a plain view granted to `authenticated`. | A plain view runs with its owner's rights and bypasses RLS. Any signed-in user could read every group's balances, which defeats security test 4 and story H-05. | `with (security_invoker = true)`. |
| 3 | `net_owed` is `security definer` with no membership check, and is granted to clients. | Anyone could read any pair's balance in any group by id. | Split in two: `net_owed_raw` is internal and granted to no client role; `net_owed` is the client-facing version and checks membership. |
| 4 | §12.4 grants EXECUTE but never revokes PostgreSQL's default EXECUTE-to-PUBLIC. | Every internal helper, including `expire_stale_proposals`, could be called from the browser console. | `revoke execute on all functions … from public, anon, authenticated`, then grant back the RPC list. |
| 5 | In table-returning functions, an output column such as `user_id` shadows the same-named table column in the function body. | Calls fail with "column reference is ambiguous" (found by the test suite). | `#variable_conflict use_column` on every table-returning function. |
| 6 | `propose_void` checks for a duplicate proposal before taking any lock. | Two simultaneous requests could create two pending voids for one expense. | The check now runs under the group lock. |
| 7 | `cancel_proposal` takes no lock. | Story C-05#3 (withdrawal racing the final approval) is not serialised. | Takes the group lock. |
| 8 | `profiles_update_own` has no matching grant. | It can never take effect. | A column-scoped `grant update (display_name, avatar_url)`. |
| 9 | Invite code is `encode(gen_random_bytes(9), 'base64')`. | Base64 can produce `+` and `/`, which break inside URL paths (A-03#6). `gen_random_bytes` also lives in Supabase's `extensions` schema and can't be reached under `search_path = ''`. | A URL-safe code built from core `gen_random_uuid()`. |

---

## 3. Additions the stories required

The plan does not cover these; the stories need them.

| Addition | For |
|---|---|
| `propose_settlement`, `propose_amendment` | Feature 2b, C-07, F-02, F-05. The plan gives payload shapes and participants but no creation functions. |
| `preview_invite` (name and member count only; reveals nothing for a bad code) | A-03 step 4, A-03#1 |
| `rotate_invite_code` (owner only) | A-05 |
| `leave_group` (refuses with a balance or as last owner), `transfer_group_ownership` | A-06 |
| `recent_similar_expense` | B-03#3 duplicate warning |
| `v_pairwise_net` view | B-04 per-person breakdown in a single query |
| `add_expense`: `DESCRIPTION_REQUIRED`, `NEEDS_ANOTHER_PARTICIPANT`, `p_client_token` retry guard | B-01#4/#6, stories §12.1 ("every write RPC must be safe to retry") |
| Proposal rate limit: 10 per user per group per hour, tunable with `alter database … set hishebnama.proposal_rate_limit` | H-06 |
| `explain_balance` extended: void rows with their reason, rounding attribution naming who got the extra poisha, rounding vs hand-entered | E-01, E-02, E-02#2, B-05#2 |

---

## 4. Not implemented, or only partly

| Item | Status |
|---|---|
| **Trips and trip leaders** (Feature 4 trips, Epic D, the leader parts of E-03, E-04, F-03, H-03, H-04, H-07) | **Removed, to be re-implemented.** No trip tables, `trip_id` columns, leader authority, leader voids, leader-recorded settlements, participant presets or disputes exist in the schema, RPCs, UI, tests or demo data. Expenses are cancelled only by agreement (`propose_void`). The plan's Phase 0 rule says a `trip_id` on `ledger_entries` must exist before any real data is written, because the table is append-only; add it back before the first real deployment. |
| **Web Push + email fallback Edge Function** (Phase 5; G-01 to G-04) | **Not built.** It needs VAPID keys and an email provider account. In place today: the inbox badge (live via Realtime, refreshed on focus), which §13.3 names as the baseline, plus a per-group "since your last visit" panel for balance changes (G-02). The Me screen says push isn't on yet. Batching (G-01#4, G-02#1) and preferences (G-04, COULD) depend on push. |
| Offline write queue (B-07, COULD; §17 future work) | Not built. There is an offline banner, drafts survive refresh and connection loss, and `add_expense` is retry-safe. |
| CSV export (E-05, COULD) | Not built. |
| bKash/Nagad deep links (F-04, COULD) | No documented public P2P deep link that pre-fills an amount, so this uses the story's own fallback (F-04#1/#2): a "Copy amount" button, with explicit text that paying doesn't record the payment. |
| Bangla | Partial. The string structure is in place (`src/lib/i18n.tsx`), with Bangla for navigation and headline vocabulary and per-key English fallback. Error messages and body copy are English only. |
| Optional decline reason (C-03 step 2) | Not built. `respond_to_proposal` (§11.4) has no reason parameter, and adding one changes a §11 signature. |
| H-06 "repeated identical proposals after rejection are flagged to the group" | Only the rate limit is implemented. |
| Account deletion / data export (§12.6) | Not built. Today, deleting an `auth.users` row that has ledger history is blocked by the foreign keys from `ledger_entries` and `expenses`, so it fails rather than corrupting anything. Without history it cascades through `profiles` to `group_members`. Use soft deactivation when this is built, as §12.6 advises. |
| Install prompt, PNG icons | The manifest and SVG icons are present, and the browser's default install prompt applies. iOS home-screen icons prefer PNG. |
| List virtualisation (A-04#5) | Not built. Plain lists are fine at friend-group scale. |

### Cannot be done from here (your accounts are needed)

- Create the Supabase project, configure Google OAuth, run `supabase db push`, and enable `pg_cron`.
- Run the Supabase database linter (§12.6), and enable leaked-password protection and the JWT expiry setting.
- Deploy to Netlify.
- §14.3 manual two-phone testing; the Phase 5 trial with a real friend group.

---

## 5. How this is verified

| Check | Command |
|---|---|
| Migrations load on PostgreSQL 16 | `npm run test:sql` |
| §12.7 checklist in SQL, run as the `authenticated` role, plus structural checks (no identity parameters, every definer function sets `search_path`, RLS on every table, triggers block UPDATE/DELETE even for the owner) | `supabase/tests/01_security.sql` |
| Story-driven behaviour, unhappy paths first; §9.1 and Feature 4.1 worked examples to the exact poisha | `supabase/tests/02_behaviour.sql` |
| Fuzz: thousands of random interleaved operations, each in its own transaction, I1–I3 and I8 asserted after **every** one; I4/I5 on every committed transfer; I6 sampled | `FUZZ_OPS=5000 npm run test:sql` |
| §14.2 concurrency: real parallel sessions, holding locks to force interleaving | `supabase/tests/concurrency.sh` |
| `money.ts` / `settle.ts` | `npm test` |
| §12.7 checklist **over HTTP** through real PostgREST | `scripts/security-checklist.mjs` |
| Browser end to end, 3 users at 390px: group → invite → join → expenses → 3-party transfer approved on 3 devices → derivation self-check → 2-sided settlement | `npm run test:e2e` |
| Production build, `npm audit --omit=dev` | `npm run build` |
