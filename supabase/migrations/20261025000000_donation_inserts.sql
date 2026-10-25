-- Browser-side donation insert.
--
-- With no indexer running, the browser is the only party that knows a donate()
-- transaction confirmed, so it writes the mirror row itself. Rows are deduplicated by
-- the existing (chain_id, tx_hash, log_index) unique index.
--
-- The anon key is public: a malicious client can insert fake rows and this table is
-- presentation-only until a verifying indexer (or an edge function that re-reads the
-- receipt) takes over. That trade-off is accepted so history works without a backend.

grant insert on public.donations to anon, authenticated;

drop policy if exists "donations are insertable by the app" on public.donations;
create policy "donations are insertable by the app"
  on public.donations for insert
  to anon, authenticated
  with check (true);
