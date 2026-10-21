-- ============================================================================
-- photos: the pictures attached to operations in the expense app.
--
-- A backup import (src/lib/photos.ts) puts every photo an operation has into the private
-- "photos" bucket, under the user's own folder: <user id>/<sha-256 of the file>.<jpg|png|…>.
-- The operations in the statement name them, and a photo is fetched only when it's opened.
-- Nothing in the bucket is public: only the signed-in owner can list, read, add or delete the
-- files in their folder. A photo is never changed in place (its name is its content), so there
-- is no update policy.
--
-- Run once in the Supabase SQL editor. Safe to run again.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can view their own photos"   on storage.objects;
drop policy if exists "Users can upload their own photos" on storage.objects;
drop policy if exists "Users can delete their own photos" on storage.objects;

create policy "Users can view their own photos" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users can upload their own photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users can delete their own photos" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
