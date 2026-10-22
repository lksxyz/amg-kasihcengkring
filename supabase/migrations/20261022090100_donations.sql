-- Donations: off-chain mirror of DonationReceived events.
--
-- Rows are written by an indexer (service role), never by the browser. The
-- browser only reads them and toggles the cosmetic `hidden` flag.
-- Addresses are stored lowercase; the indexer must normalize before insert.

create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  chain_id bigint not null default 5042002,
  tx_hash text not null check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  log_index integer not null default 0,
  block_number bigint,
  block_timestamp bigint not null,
  creator_wallet text not null check (creator_wallet = lower(creator_wallet)),
  creator_username text not null check (creator_username ~ '^[a-z0-9_]{3,20}$'),
  donor_address text not null check (donor_address = lower(donor_address)),
  donor_name text,
  message text,
  amount_raw numeric(78, 0) not null check (amount_raw >= 0),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists donations_event_unique
  on public.donations (chain_id, tx_hash, log_index);

create index if not exists donations_creator_wallet_idx
  on public.donations (creator_wallet, block_timestamp desc);

create index if not exists donations_creator_username_idx
  on public.donations (creator_username, block_timestamp desc);

create index if not exists donations_donor_address_idx
  on public.donations (donor_address);

alter table public.donations enable row level security;

-- On-chain donations are public; `hidden` is presentation only.
drop policy if exists "donations are publicly readable" on public.donations;
create policy "donations are publicly readable"
  on public.donations for select
  to anon, authenticated
  using (true);

-- The history page hides/unhides donations with the anon key. There is no
-- creator authentication yet, so this is cosmetic and griefable: anyone can
-- flip the flag. Restrict or move behind a signature check before mainnet.
drop policy if exists "donation hidden flag is togglable by the app" on public.donations;
create policy "donation hidden flag is togglable by the app"
  on public.donations for update
  to anon, authenticated
  using (true)
  with check (true);

grant select on public.donations to anon, authenticated;
grant update (hidden) on public.donations to anon, authenticated;
grant insert, update, delete on public.donations to service_role;
