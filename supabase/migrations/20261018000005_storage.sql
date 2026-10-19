-- Cheffy Storage buckets and policies.
--
-- avatars      public bucket; anyone can read, owners write under {uid}/
-- post-images  private bucket; read access mirrors post visibility,
--              owners write under {uid}/{post_id}/

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 2 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp']),
  ('post-images', 'post-images', false, 6 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Avatars ------------------------------------------------------------------
create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Owners can list their own avatar folder (used when deleting an account).
create policy avatars_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Post images ----------------------------------------------------------------
-- Readable by the owner, or by anyone who can see a post that references the
-- file (post_images is itself filtered by post visibility).
create policy post_images_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'post-images'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.post_images pi
        where pi.storage_path = objects.name or pi.thumb_path = objects.name
      )
    )
  );

create policy post_images_objects_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'post-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy post_images_objects_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'post-images' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'post-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy post_images_objects_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'post-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
