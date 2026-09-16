-- ============================================================================
-- Lock every user table down to its owner.
--
-- Why: an anonymous request with the public key (it is in the repo and in the
-- deployed JS bundle) could read `accounts`, `wishlist` and `category_limits`
-- in full — wallet names/balances, goals, budget. `trips` and `user_settings`
-- were already protected. The old "Enable public access" policy on wishlist
-- (supabase_setup.sql) was never dropped, and `accounts` never had RLS.
--
-- Run in the Supabase SQL editor. Idempotent: drops every existing policy on
-- these tables and recreates the owner-only set, so stray policies created
-- from the dashboard are removed too.
-- ============================================================================

-- 1. Wipe all existing policies on the app tables (names may differ from the repo).
do $$
declare
  p record;
begin
  for p in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('accounts', 'wishlist', 'category_limits', 'trips', 'user_settings')
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- 2. Turn RLS on everywhere (no-op where it already is).
alter table public.accounts        enable row level security;
alter table public.wishlist        enable row level security;
alter table public.category_limits enable row level security;
alter table public.trips           enable row level security;
alter table public.user_settings   enable row level security;

-- 3. Owner-only policies: a row is visible/editable only to the signed-in user
--    whose id is in user_id. Anonymous requests (auth.uid() is null) get nothing.
do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'wishlist', 'category_limits', 'trips', 'user_settings']
  loop
    execute format('create policy "Users can view their own %1$s"   on public.%1$I for select using (auth.uid() = user_id)', t);
    execute format('create policy "Users can insert their own %1$s" on public.%1$I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "Users can update their own %1$s" on public.%1$I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "Users can delete their own %1$s" on public.%1$I for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;

-- 4. Check: every table should show rowsecurity = true and exactly 4 policies.
select t.tablename,
       t.rowsecurity,
       count(p.policyname) as policies
from pg_tables t
left join pg_policies p on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public'
  and t.tablename in ('accounts', 'wishlist', 'category_limits', 'trips', 'user_settings')
group by t.tablename, t.rowsecurity
order by t.tablename;
