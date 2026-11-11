-- KUMPRALL listing image storage. Run in Supabase SQL Editor.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kumprall-listing-images', 'kumprall-listing-images', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];

drop policy if exists "Public can view KUMPRALL listing images" on storage.objects;
create policy "Public can view KUMPRALL listing images"
on storage.objects for select
to public
using (bucket_id = 'kumprall-listing-images');

drop policy if exists "Authenticated users can upload own KUMPRALL images" on storage.objects;
create policy "Authenticated users can upload own KUMPRALL images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'kumprall-listing-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update own KUMPRALL images" on storage.objects;
create policy "Users can update own KUMPRALL images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'kumprall-listing-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'kumprall-listing-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete own KUMPRALL images" on storage.objects;
create policy "Users can delete own KUMPRALL images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'kumprall-listing-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
