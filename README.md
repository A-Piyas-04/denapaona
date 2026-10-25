# HishebNama

A consent-based debt ledger for friend groups. It is a mobile-first PWA built with Vite, React and Supabase.

- **What it must do:** [`USER_STORIES.md`](USER_STORIES.md)
- **How it is built:** [`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md). Read §7, §8, §11, §12 and §14 before changing anything.
- **Where the implementation departs from the plan, and what is not built yet:** [`IMPLEMENTATION_NOTES.md`](IMPLEMENTATION_NOTES.md)

The hard rules, in brief: `ledger_entries` is append-only; balances are always derived; the database makes every decision; identity comes only from `auth.uid()`; money is integer poisha.

## Layout

```
supabase/
  migrations/                 the whole schema, RLS and RPC layer (Phase 0: everything lands at once)
    …0100_schema.sql          tables, append-only trigger
    …0200_views_and_helpers   v_user_net, v_trip_net, v_pairwise_net, net_owed, is_trip_leader
    …0300_rpc_core.sql        groups, add_expense, propose_*, cancel, expiry
    …0400_rpc_respond.sql     respond_to_proposal: lock → re-validate live → commit
    …0500_rpc_trips.sql       trips, leaders, voids, disputes, explain_balance
    …0600_rls.sql             default-deny, read-only grants, RPC execute list
    …0700_realtime_and_cron   Realtime publication, hourly expiry sweep
  tests/                      SQL suites, fuzz harness, concurrency races, e2e
scripts/security-checklist.mjs   §12.7, runnable against a real deployment
src/
  lib/       money.ts, settle.ts (pure, unit-tested), rpc.ts, errors.ts, i18n.tsx, types.ts
  hooks/     data access (TanStack Query) and Realtime
  components/  BalanceCard, ExpenseForm, TransferBuilder, DerivationView, ProposalCard, ui/
  routes/    one file per screen (§13.1)
```

## Local development

```bash
npm install
cp .env.example .env.local          # VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY — nothing else
npm run dev
```

**Never put the service role key in any `VITE_` variable** (§12.2). The anon key is public by design.

## Tests

| Command | What it runs | Needs |
|---|---|---|
| `npm test` | Vitest for `money.ts` and `settle.ts` | — |
| `npm run test:sql` | Migrations on PostgreSQL 16, the §12.7 checklist in SQL, the story behaviour suite, a fuzz run checking I1–I10 after every operation, and the §14.2 concurrency races | Docker |
| `npm run test:e2e` | Real PostgREST: the §12.7 checklist over HTTP, then a three-user browser run of the core flows | Docker; Playwright Chromium (`npx playwright-core install chromium`, or set `CHROME_PATH`) |

Knobs: `FUZZ_OPS=5000` (default 3000), `ROUNDS=10` for the concurrency races (default 5), `KEEP=1` to keep the database container running afterwards.

The SQL tests use a small stand-in for Supabase (`supabase/tests/shim/`): the `anon` and `authenticated` roles, `auth.users`, and an `auth.uid()` that reads JWT claims the same way Supabase does. **Never apply the shim to a real project.**

## Deploying (§16)

1. **Supabase.** Create a project.
   - Enable the Google provider under Auth → Providers.
   - Under Auth → URL Configuration, add `https://<your-site>/auth/callback`.
   - Enable `pg_cron` under Database → Extensions.
2. **Migrations.** Run `npx supabase link --project-ref <ref>`, then `npx supabase db push`. If `pg_cron` was not enabled first, the expiry sweep is skipped with a notice. Expiry is still enforced at approval time. Enable it later and re-run the `cron.schedule` statement in `…0700`.
3. **Security gate.** Before any real use, sign three throwaway accounts in to the deployed app and run:
   ```bash
   HN_URL=https://<ref>.supabase.co HN_ANON_KEY=<anon> HN_TOKEN_A=… HN_TOKEN_B=… HN_TOKEN_C=… npm run security:check
   ```
   Every attack must be refused. Also run Supabase's database linter, and turn on leaked-password protection.
4. **Netlify.** Connect the repo. `netlify.toml` sets the build command, SPA routing and security headers, including a CSP that allows only `*.supabase.co`. In the Netlify UI, set exactly two environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. **Google Cloud.** Add the Netlify URL to the OAuth consent screen.
6. **Backups.** Export `ledger_entries` weekly. It is the only table that cannot be rebuilt.

Before each deploy, run `npm audit --omit=dev`, `npm run test:sql`, and the security checklist.
