-- ============================================================================
-- statements: a copy of the last imported statement, for the online MCP server.
--
-- One row per user, written by the app on every signed-in import (lib/statementCloud): the
-- operations as the app parsed them, and the wallets' day-by-day balances from the last backup.
-- The online MCP server (supabase/functions/mcp) reads it when Claude on the phone or the web, or
-- ChatGPT, asks about money. Owner-only like every table (supabase_migration_rls.sql lists it too).
--
-- Run once in the Supabase SQL editor. Safe to run again.
-- ============================================================================

create table if not exists public.statements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  file_name text,                                   -- the imported file, e.g. 2026_10_18_17_36_01_123747.mmbackup
  imported_at timestamptz not null,                 -- when it was imported into the app
  transaction_count integer not null default 0,
  latest_date date,                                 -- the newest operation in it
  transactions jsonb not null default '[]'::jsonb,  -- every operation, as the app keeps them (src/types Transaction)
  wallet_history jsonb,                             -- lib/netWorth WalletHistory from the last backup; null before any
  updated_at timestamptz not null default now()
);

alter table public.statements enable row level security;

drop policy if exists "Users can view their own statements"   on public.statements;
drop policy if exists "Users can insert their own statements" on public.statements;
drop policy if exists "Users can update their own statements" on public.statements;
drop policy if exists "Users can delete their own statements" on public.statements;

create policy "Users can view their own statements"   on public.statements for select using (auth.uid() = user_id);
create policy "Users can insert their own statements" on public.statements for insert with check (auth.uid() = user_id);
create policy "Users can update their own statements" on public.statements for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own statements" on public.statements for delete using (auth.uid() = user_id);
