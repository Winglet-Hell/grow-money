-- Goals (the `wishlist` table): a price in any currency, and the day a goal was reached.
--   price      — what the goal costs, in `currency`. Older goals have only "costRUB"; it is copied here.
--   currency   — RUB, USD, THB, USDT… The Goals page values the price at today's rate, and
--                "costRUB" keeps its value in rubles as of the last save.
--   reached_on — the day the goal was reached or bought. Reached goals leave the plan and are listed apart.
-- Run once in the Supabase SQL editor (safe to run again). The table's owner-only RLS policies cover new columns.

alter table public.wishlist add column if not exists price numeric;
alter table public.wishlist add column if not exists currency text not null default 'RUB';
alter table public.wishlist add column if not exists reached_on date;

update public.wishlist set price = "costRUB" where price is null;
