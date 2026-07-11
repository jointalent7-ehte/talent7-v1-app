insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('challenge-proofs', 'challenge-proofs', true, 104857600, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime']),
  ('showcase-media', 'showcase-media', true, 104857600, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read Talent7 storage files" on storage.objects;
drop policy if exists "Authenticated users can upload Talent7 storage files" on storage.objects;

create policy "Public can read Talent7 storage files"
on storage.objects for select
using (bucket_id in ('challenge-proofs', 'showcase-media'));

create policy "Authenticated users can upload Talent7 storage files"
on storage.objects for insert
to authenticated
with check (
  bucket_id in ('challenge-proofs', 'showcase-media')
  and auth.uid()::text = (storage.foldername(name))[1]
);
