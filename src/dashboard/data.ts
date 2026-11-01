import { useEffect, useState, useSyncExternalStore } from 'react'
import { fetchMarket } from '../marketSource'

export interface LlamaPool {
  pool: string
  chain: string
  project: string
  symbol: string
  tvlUsd: number
  apy: number | null
  apyBase: number | null
  apyReward: number | null
  apyMean30d: number | null
  apyPct7D: number | null
  stablecoin: boolean
  ilRisk: string
  exposure: string
  poolMeta: string | null
  underlyingTokens: string[] | null
  rewardTokens: string[] | null
}

export type PoolsSnapshot =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; pools: LlamaPool[]; byId: Map<string, LlamaPool>; fetchedAt: number }

export const SOURCE = 'DefiLlama'

let snapshot: PoolsSnapshot = { status: 'idle' }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function loadPools(force = false) {
  if (!force && (snapshot.status === 'loading' || snapshot.status === 'ready')) return
  snapshot = { status: 'loading' }
  emit()
  fetchMarket<LlamaPool>('/pools')
    .then(({ data, fetchedAt }) => {
      const pools = data.filter((p) => p.tvlUsd > 0)
      snapshot = { status: 'ready', pools, byId: new Map(pools.map((p) => [p.pool, p])), fetchedAt }
      emit()
    })
    .catch((e: Error) => {
      snapshot = { status: 'error', message: e.message || 'Network error' }
      emit()
    })
}

export function usePoolsData(): PoolsSnapshot {
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => snapshot,
  )
  useEffect(() => {
    loadPools()
  }, [])
  return snap
}

export interface ProtocolInfo {
  name: string
  url?: string
  description?: string
  category?: string
  logo?: string
  chains?: string[]
  audits?: string | null
  audit_note?: string | null
  audit_links?: string[]
  twitter?: string | null
}

type Async<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T; fetchedAt: number }

function useFetchJson<T>(url: string | null, pick: (raw: unknown) => T): Async<T> {
  const [state, setState] = useState<Async<T>>({ status: 'loading' })
  useEffect(() => {
    if (!url) return
    const ctrl = new AbortController()
    setState({ status: 'loading' })
    fetch(url, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((raw) => setState({ status: 'ready', data: pick(raw), fetchedAt: Date.now() }))
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setState({ status: 'error', message: e.message || 'Network error' })
      })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])
  return state
}

export function useProtocol(slug: string | undefined) {
  return useFetchJson<ProtocolInfo>(slug ? `https://api.llama.fi/protocol/${slug}` : null, (raw) => {
    const r = raw as ProtocolInfo
    return {
      name: r.name,
      url: r.url,
      description: r.description,
      category: r.category,
      logo: r.logo,
      chains: r.chains,
      audits: r.audits,
      audit_note: r.audit_note,
      audit_links: r.audit_links,
      twitter: r.twitter,
    }
  })
}

export interface ChartPoint {
  timestamp: string
  apy: number | null
  tvlUsd: number
}

export function usePoolChart(poolId: string | undefined): Async<ChartPoint[]> {
  const [state, setState] = useState<Async<ChartPoint[]>>({ status: 'loading' })
  useEffect(() => {
    if (!poolId) return
    const ctrl = new AbortController()
    setState({ status: 'loading' })
    fetchMarket<ChartPoint>(`/chart/${encodeURIComponent(poolId)}`, ctrl.signal)
      .then(({ data, fetchedAt }) => setState({ status: 'ready', data: data.filter((p) => typeof p.apy === 'number'), fetchedAt }))
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setState({ status: 'error', message: e.message || 'Network error' })
      })
    return () => ctrl.abort()
  }, [poolId])
  return state
}

export function protocolLogo(slug: string) {
  return `https://icons.llama.fi/${slug}.jpg`
}

export function prettyProject(slug: string) {
  return slug
    .split('-')
    .map((w) => (w.length <= 3 && /\d/.test(w) ? w.toUpperCase() : w[0]?.toUpperCase() + w.slice(1)))
    .join(' ')
}

export function fmtUsd(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

export function fmtPct(n: number | null | undefined, digits = 2): string {
  if (n == null || !isFinite(n)) return '—'
  return `${n.toFixed(digits)}%`
}

export function timeAgo(ts: number, now = Date.now()): string {
  const min = Math.floor((now - ts) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.floor(h / 24)} days ago`
}

export function useNow(intervalMs = 15000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
