-- ============================================================================
-- Give ownerless rows back to their user.
--
-- Rows written before the user_id columns existed have user_id = null. Before
-- supabase_migration_rls.sql the app read them anyway (category_limits had no
-- user filter at all, which is why the budget used to be 138 800 ₽ and dropped
-- to 41 500 ₽ once RLS hid the null-owner rows). Under owner-only policies
-- nobody can see or edit them, so they have to be claimed from the SQL editor.
--
-- Run step 1, look at the counts, then paste your user id into step 3.
-- ============================================================================

-- 1. How many rows have no owner?
select 'category_limits' as "table", count(*) as orphaned from public.category_limits where user_id is null
union all select 'wishlist',      count(*) from public.wishlist        where user_id is null
union all select 'accounts',      count(*) from public.accounts        where user_id is null
union all select 'trips',         count(*) from public.trips           where user_id is null
union all select 'user_settings', count(*) from public.user_settings   where user_id is null;

-- 2. Your id (the app is single-user; if several rows come back, pick yours by email).
select id, email, created_at from auth.users order by created_at;

-- 3. Claim the rows. Replace the placeholder with the id from step 2, then run.
do $$
declare
  me uuid := '00000000-0000-0000-0000-000000000000';  -- <-- paste your id here
begin
  if me = '00000000-0000-0000-0000-000000000000' then
    raise exception 'Paste your user id into the `me` variable first';
  end if;

  -- category_limits has a unique (user_id, category) key: adopt a null-owner
  -- limit only when you don't already have one for that category, then drop
  -- the leftovers so nothing stays invisible.
  update public.category_limits l
     set user_id = me
   where l.user_id is null
     and not exists (select 1 from public.category_limits m where m.user_id = me and m.category = l.category);
  delete from public.category_limits where user_id is null;

  update public.wishlist      set user_id = me where user_id is null;
  update public.accounts      set user_id = me where user_id is null;
  update public.trips         set user_id = me where user_id is null;
  update public.user_settings set user_id = me where user_id is null;
end $$;

-- 4. Check: everything should be 0 now, and the limits sum should be back to ~138 800.
select 'category_limits' as "table", count(*) as orphaned from public.category_limits where user_id is null
union all select 'wishlist', count(*) from public.wishlist where user_id is null
union all select 'accounts', count(*) from public.accounts where user_id is null
union all select 'trips',    count(*) from public.trips    where user_id is null;

select count(*) as my_limits, sum(amount) as budget_per_month
from public.category_limits
where user_id = (select id from auth.users order by created_at limit 1);
