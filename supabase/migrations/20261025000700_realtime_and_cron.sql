-- ═══════════════════════════════════════════════════════════════════════════
-- Realtime publication and the proposal expiry sweep (§6, §11.7, §13.4)
--
-- Both are guarded so the full migration set also loads on a plain Postgres
-- (the local SQL test harness).  On Supabase both branches take effect.
-- ═══════════════════════════════════════════════════════════════════════════

-- Realtime is a convenience, not a correctness mechanism (§13.4).  Supabase
-- Realtime applies RLS to postgres_changes, so subscribers only receive rows
-- they could already select.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime
      add table proposals, proposal_participants, ledger_entries,
                expenses, trips, trip_leaders, entry_disputes;
  end if;
end $$;

-- Expiry is enforced in two places by design (story C-06 unhappy path 2):
-- this sweep, and the expires_at check inside respond_to_proposal.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('expire-proposals', '0 * * * *',
                        $cron$ select public.expire_stale_proposals() $cron$);
exception when others then
  raise notice 'pg_cron unavailable (%); relying on approval-time expiry only', sqlerrm;
end $$;
