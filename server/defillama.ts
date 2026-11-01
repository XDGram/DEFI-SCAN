import type { ServerConfig } from './config.js'
import { errorResult, publicCache, type ApiResult } from './http.js'
import { log } from './redact.js'

// Only the fields the frontend reads. Keeps responses small and avoids passing through unreviewed data.
const POOL_FIELDS = [
  'pool', 'chain', 'project', 'symbol', 'tvlUsd', 'apy', 'apyBase', 'apyReward', 'apyMean30d', 'apyPct7D',
  'stablecoin', 'ilRisk', 'exposure', 'poolMeta', 'underlyingTokens', 'rewardTokens',
] as const

const POOL_ID = /^[A-Za-z0-9-]{1,80}$/
const TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { at: number; body: unknown }>()

type Fetch = typeof fetch

async function upstream(cfg: ServerConfig, path: string, f: Fetch): Promise<unknown> {
  const res = await f(`${cfg.defillama.yieldsBase}${path}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`upstream_status_${res.status}`)
  return res.json()
}

function pick(p: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const k of POOL_FIELDS) out[k] = p[k] ?? null
  return out
}

async function cached(key: string, load: () => Promise<unknown>): Promise<{ body: unknown; fetchedAt: number }> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return { body: hit.body, fetchedAt: hit.at }
  const body = await load()
  const at = Date.now()
  cache.set(key, { at, body })
  return { body, fetchedAt: at }
}

export function clearMarketCache() {
  cache.clear()
}

export async function marketPools(cfg: ServerConfig, f: Fetch = fetch): Promise<ApiResult> {
  try {
    const { body, fetchedAt } = await cached('pools', async () => {
      const raw = (await upstream(cfg, '/pools', f)) as { data?: unknown }
      if (!Array.isArray(raw.data)) throw new Error('upstream_shape')
      return (raw.data as Record<string, unknown>[]).filter((p) => p && typeof p.pool === 'string').map(pick)
    })
    return { status: 200, headers: publicCache(300), body: { source: 'DefiLlama', fetchedAt, data: body } }
  } catch (e) {
    // Never echo the upstream URL: with a paid plan it can carry the API key.
    log.warn('defillama_pools_failed', { message: (e as Error).message })
    return errorResult(502, 'market_data_unavailable', {}, false)
  }
}

export async function marketChart(cfg: ServerConfig, poolId: string, f: Fetch = fetch): Promise<ApiResult> {
  if (!POOL_ID.test(poolId)) return errorResult(400, 'invalid_pool_id', {}, false)
  try {
    const { body, fetchedAt } = await cached(`chart:${poolId}`, async () => {
      const raw = (await upstream(cfg, `/chart/${encodeURIComponent(poolId)}`, f)) as { data?: unknown }
      if (!Array.isArray(raw.data)) throw new Error('upstream_shape')
      return (raw.data as Record<string, unknown>[]).map((d) => ({ timestamp: d.timestamp ?? null, apy: d.apy ?? null, tvlUsd: d.tvlUsd ?? null }))
    })
    return { status: 200, headers: publicCache(600), body: { source: 'DefiLlama', fetchedAt, data: body } }
  } catch (e) {
    log.warn('defillama_chart_failed', { message: (e as Error).message })
    return errorResult(502, 'market_data_unavailable', {}, false)
  }
}
