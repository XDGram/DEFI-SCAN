import { useEffect, useState } from 'react'

export interface Pool {
  pool: string
  chain: string
  project: string
  symbol: string
  tvlUsd: number
  apy: number | null
}

export type PoolsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; pools: Pool[]; fetchedAt: Date }

const SOURCE_URL = 'https://yields.llama.fi/pools'

export function usePools(count: number): PoolsState {
  const [state, setState] = useState<PoolsState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    fetch(SOURCE_URL, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<{ data: Pool[] }>
      })
      .then(({ data }) => {
        const pools = data
          .filter((p) => typeof p.apy === 'number' && p.apy > 0 && p.tvlUsd > 0)
          .sort((a, b) => b.tvlUsd - a.tvlUsd)
          .slice(0, count)
        setState({ status: 'ready', pools, fetchedAt: new Date() })
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setState({ status: 'error' })
      })
    return () => controller.abort()
  }, [count])

  return state
}

export function formatUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}
