-- ==========================================
-- 1. Wishlists (with Cleanup)
-- ==========================================

-- Cleanup existing policies to avoid errors
drop policy if exists "Users can view their own wishlist" on wishlist;
drop policy if exists "Users can insert their own wishlist" on wishlist;
drop policy if exists "Users can update their own wishlist" on wishlist;
drop policy if exists "Users can delete their own wishlist" on wishlist;
drop policy if exists "Users can manage their own wishlist" on wishlist;

-- Add user_id column
alter table wishlist 
add column if not exists user_id uuid references auth.users(id);

-- Enable Security
alter table wishlist enable row level security;

-- Re-create Policies
create policy "Users can view their own wishlist"
on wishlist for select using ( auth.uid() = user_id );

create policy "Users can insert their own wishlist"
on wishlist for insert with check ( auth.uid() = user_id );

create policy "Users can update their own wishlist"
on wishlist for update using ( auth.uid() = user_id );

create policy "Users can delete their own wishlist"
on wishlist for delete using ( auth.uid() = user_id );


-- ==========================================
-- 2. Category Limits (with Cleanup)
-- ==========================================

-- Cleanup existing policies
drop policy if exists "Users can view their own limits" on category_limits;
drop policy if exists "Users can insert their own limits" on category_limits;
drop policy if exists "Users can update their own limits" on category_limits;
drop policy if exists "Users can delete their own limits" on category_limits;
drop policy if exists "Users can manage their own limits" on category_limits;

-- Create table if needed
create table if not exists category_limits (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  category text not null,
  amount numeric not null,
  user_id uuid references auth.users(id)
);

-- Ensure user_id exists
alter table category_limits 
add column if not exists user_id uuid references auth.users(id);

-- Fix Unique Constraint
alter table category_limits drop constraint if exists category_limits_category_key;
alter table category_limits drop constraint if exists category_limits_user_category_key;
alter table category_limits add constraint category_limits_user_category_key unique (user_id, category);

-- Enable Security
alter table category_limits enable row level security;

-- Re-create Policies
create policy "Users can view their own limits"
on category_limits for select using ( auth.uid() = user_id );

create policy "Users can insert their own limits"
on category_limits for insert with check ( auth.uid() = user_id );

create policy "Users can update their own limits"
on category_limits for update using ( auth.uid() = user_id );

create policy "Users can delete their own limits"
on category_limits for delete using ( auth.uid() = user_id );
