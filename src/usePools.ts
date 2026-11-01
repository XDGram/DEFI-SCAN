import { useEffect, useState } from 'react'
import { fetchMarket } from './marketSource'

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

export function usePools(count: number): PoolsState {
  const [state, setState] = useState<PoolsState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    fetchMarket<Pool>('/pools', controller.signal)
      .then(({ data, fetchedAt }) => {
        const pools = data
          .filter((p) => typeof p.apy === 'number' && p.apy > 0 && p.tvlUsd > 0)
          .sort((a, b) => b.tvlUsd - a.tvlUsd)
          .slice(0, count)
        setState({ status: 'ready', pools, fetchedAt: new Date(fetchedAt) })
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
