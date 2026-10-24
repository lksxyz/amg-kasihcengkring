-- Platform fee on donations.
--
-- A flat + proportional fee is forwarded to the treasury in the same transaction
-- as the donation. The DonationReceived event carries the fee, so the mirror must
-- store it alongside gross and net.

alter table public.donations
  add column if not exists fee_raw numeric(78, 0) not null default 0
    check (fee_raw >= 0);

alter table public.donations
  add column if not exists net_raw numeric(78, 0)
    generated always as (amount_raw - fee_raw) stored;

-- A fee can never exceed the donation it is taken from.
alter table public.donations
  drop constraint if exists donations_fee_not_above_amount;
alter table public.donations
  add constraint donations_fee_not_above_amount check (fee_raw <= amount_raw);

comment on column public.donations.amount_raw is
  'Gross donation: the amount the donor approved.';
comment on column public.donations.fee_raw is
  'Platform fee withheld from the gross amount (flat + bps).';
comment on column public.donations.net_raw is
  'Net amount that reached the creator: amount_raw - fee_raw.';
