-- Add profile columns to user_settings table
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS avatar_icon text;

-- (Optional) Update policies if needed, but existing ones cover "Users can update their own settings" which applies to the whole row usually.
-- Just to be safe, let's ensure the policies I wrote previously allow update of all columns.
-- "create policy ... on user_settings for update using ( auth.uid() = user_id );" -> This is sufficient.
