-- ==========================================
-- 3. User Settings
-- ==========================================

-- Create table
create table if not exists user_settings (
  user_id uuid references auth.users(id) primary key,
  updated_at timestamp with time zone default now(),
  preferences jsonb default '{}'::jsonb
);

-- Enable Security
alter table user_settings enable row level security;

-- Policies
create policy "Users can view their own settings"
on user_settings for select using ( auth.uid() = user_id );

create policy "Users can insert their own settings"
on user_settings for insert with check ( auth.uid() = user_id );

create policy "Users can update their own settings"
on user_settings for update using ( auth.uid() = user_id );

-- (Delete generally not needed for settings, but fine to add)
create policy "Users can delete their own settings"
on user_settings for delete using ( auth.uid() = user_id );
