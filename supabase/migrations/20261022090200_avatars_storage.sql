-- Avatar storage: public bucket, browser uploads.
--
-- Upload paths are `<wallet_lowercase>/avatar.<ext>` (see SettingsPage). As with
-- profiles, uploads use the anon key and are not tied to the wallet identity
-- yet; move to signed uploads before mainnet.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "avatars are publicly readable" on storage.objects;
create policy "avatars are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'avatars');

drop policy if exists "avatars are uploadable by the app" on storage.objects;
create policy "avatars are uploadable by the app"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'avatars');

drop policy if exists "avatars are replaceable by the app" on storage.objects;
create policy "avatars are replaceable by the app"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'avatars')
  with check (bucket_id = 'avatars');
