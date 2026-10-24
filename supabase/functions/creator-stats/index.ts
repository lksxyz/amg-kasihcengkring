/**
 * creator-stats — dashboard aggregates for one creator wallet.
 *
 * GET /functions/v1/creator-stats?wallet=0x…
 *
 * Returns the same shape the dashboard already derives from chain logs
 * (`Stats` in src/pages/AppDashboard.tsx): USDC decimal strings, 2 places,
 * net of the platform fee, plus a supporter count. `total`/`last7`/`last30`
 * are display-ready, so the client can swap one source for the other without
 * reformatting.
 *
 * The donations mirror is public read (RLS: `using (true)` to anon), so this
 * function needs no service-role key — it reads with the anon key that the
 * edge runtime injects. It exposes aggregates only, nothing the anon key could
 * not already select directly.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

/** USDC (6 decimals) micro-units → "12.34", rounding half up on the cents place. */
function formatUsdc(raw: bigint): string {
  const cents = (raw + 5_000n) / 10_000n
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`
}

interface DonationRow {
  amount_raw: string | number
  net_raw?: string | number
  block_timestamp: string | number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405)

  const wallet = new URL(req.url).searchParams.get('wallet')?.toLowerCase()
  if (!wallet || !/^0x[0-9a-f]{40}$/.test(wallet)) {
    return json({ error: 'wallet required (0x-prefixed address)' }, 400)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { auth: { persistSession: false } },
  )

  const query = (columns: string) =>
    supabase
      .from('donations')
      .select(columns)
      .eq('creator_wallet', wallet)
      .eq('hidden', false)

  // `net_raw` and `fee_raw` arrive with supabase/migrations/…_donation_fees.sql. Until that
  // migration is applied to the project those columns do not exist (Postgres 42703), so fall
  // back to the gross column rather than failing the whole endpoint.
  let { data, error } = await query('amount_raw, net_raw, block_timestamp')
  let hasNet = true
  if (error?.code === '42703') {
    hasNet = false
    ;({ data, error } = await query('amount_raw, block_timestamp'))
  }

  if (error) return json({ error: error.message }, 500)

  const rows = (data ?? []) as DonationRow[]
  // Without the fee column the mirror cannot tell gross from net; report gross.
  const amountOf = (row: DonationRow) =>
    hasNet ? BigInt(row.net_raw ?? 0) : BigInt(row.amount_raw ?? 0)

  const now = Math.floor(Date.now() / 1000)
  const sum = (list: DonationRow[]) => list.reduce((acc, row) => acc + amountOf(row), 0n)

  return json({
    total: formatUsdc(sum(rows)),
    last7: formatUsdc(sum(rows.filter((r) => Number(r.block_timestamp) >= now - 7 * 86_400))),
    last30: formatUsdc(sum(rows.filter((r) => Number(r.block_timestamp) >= now - 30 * 86_400))),
    count: rows.length,
  })
})
