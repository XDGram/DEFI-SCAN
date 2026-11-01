// Real DefiLlama yield data. Prefers the app's server proxy (/api/market/*), which holds any API key and
// caches upstream calls. Falls back to the legacy public endpoint when the proxy is not available
// (local Vite dev, or before the backend is deployed). The legacy endpoint stops working on 13 Nov 2026.
const LEGACY_BASE = 'https://yields.llama.fi'

export interface MarketResponse<T> {
  data: T[]
  fetchedAt: number
}

async function viaProxy<T>(path: string, signal?: AbortSignal): Promise<MarketResponse<T> | null> {
  try {
    const r = await fetch(`/api/market${path}`, { signal })
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('application/json')) return null
    const body = (await r.json()) as { data?: T[]; fetchedAt?: number }
    return Array.isArray(body.data) ? { data: body.data, fetchedAt: typeof body.fetchedAt === 'number' ? body.fetchedAt : Date.now() } : null
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    return null
  }
}

export async function fetchMarket<T>(path: '/pools' | `/chart/${string}`, signal?: AbortSignal): Promise<MarketResponse<T>> {
  const proxied = await viaProxy<T>(path, signal)
  if (proxied) return proxied
  const r = await fetch(`${LEGACY_BASE}${path}`, { signal })
  if (!r.ok) throw new Error(`DefiLlama responded with HTTP ${r.status}`)
  const body = (await r.json()) as { data?: T[] }
  if (!Array.isArray(body.data)) throw new Error('Unexpected DefiLlama response')
  return { data: body.data, fetchedAt: Date.now() }
}
