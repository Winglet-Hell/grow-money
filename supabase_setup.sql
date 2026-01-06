-- Run this in your Supabase SQL Editor

create table wishlist (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  "costRUB" numeric not null,
  priority text check (priority in ('Low', 'Medium', 'High')) not null,
  "imageURL" text
);

-- Turn on Row Level Security (RLS) recommended, but for now Public access:
alter table wishlist enable row level security;

create policy "Enable public access"
on wishlist
for all
using (true)
with check (true);
