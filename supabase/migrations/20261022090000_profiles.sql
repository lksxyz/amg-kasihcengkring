-- Profiles: off-chain mirror of creator metadata.
--
-- Writes are performed by the browser with the anon key because the app has no
-- auth backend yet. That means anyone holding the anon key (it is public) can
-- edit any profile. This is acceptable for a testnet demo; before mainnet, move
-- writes behind an edge function that verifies an EIP-191 signature from
-- wallet_address and grant the anon role SELECT only.
--
-- Addresses are stored lowercase. Application queries normalize with
-- wallet_address.toLowerCase().

create table if not exists public.profiles (
  wallet_address text primary key check (wallet_address = lower(wallet_address)),
  username text unique check (username is null or username ~ '^[a-z0-9_]{3,20}$'),
  display_name text check (display_name is null or char_length(display_name) <= 60),
  bio text check (bio is null or char_length(bio) <= 300),
  twitter_url text check (twitter_url is null or twitter_url ~ '^https?://'),
  website_url text check (website_url is null or website_url ~ '^https?://'),
  avatar_url text,
  payout_address text check (payout_address is null or payout_address = lower(payout_address)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_username_idx on public.profiles (username);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row
  execute function public.touch_updated_at();

alter table public.profiles enable row level security;

drop policy if exists "profiles are publicly readable" on public.profiles;
create policy "profiles are publicly readable"
  on public.profiles for select
  to anon, authenticated
  using (true);

drop policy if exists "profiles are writable by the app" on public.profiles;
create policy "profiles are writable by the app"
  on public.profiles for insert
  to anon, authenticated
  with check (true);

drop policy if exists "profiles are updatable by the app" on public.profiles;
create policy "profiles are updatable by the app"
  on public.profiles for update
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update on public.profiles to anon, authenticated;
