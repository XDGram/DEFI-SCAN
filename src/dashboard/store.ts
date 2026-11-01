import { useCallback, useSyncExternalStore } from 'react'
import type { LlamaPool } from './data'

const PREFIX = 'dos:'
const EVENT = 'dos-store'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

const cache = new Map<string, { raw: string | null; value: unknown }>()

function getCached<T>(key: string, fallback: T): T {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(PREFIX + key)
  } catch {
    /* storage unavailable */
  }
  const hit = cache.get(key)
  if (hit && hit.raw === raw) return hit.value as T
  const value = raw ? read(key, fallback) : fallback
  cache.set(key, { raw, value })
  return value
}

export function write<T>(key: string, value: T) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(EVENT))
}

export function useStored<T>(key: string, fallback: T): [T, (v: T | ((prev: T) => T)) => void] {
  const value = useSyncExternalStore(
    (l) => {
      window.addEventListener(EVENT, l)
      window.addEventListener('storage', l)
      return () => {
        window.removeEventListener(EVENT, l)
        window.removeEventListener('storage', l)
      }
    },
    () => getCached(key, fallback),
  )
  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      const next = typeof v === 'function' ? (v as (p: T) => T)(getCached(key, fallback)) : v
      write(key, next)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  )
  return [value, set]
}

export interface PoolSnapshot {
  pool: string
  project: string
  chain: string
  symbol: string
  apy: number | null
  tvlUsd: number
  fetchedAt: number
}

export function snapshotOf(p: LlamaPool, fetchedAt: number): PoolSnapshot {
  return { pool: p.pool, project: p.project, chain: p.chain, symbol: p.symbol, apy: p.apy, tvlUsd: p.tvlUsd, fetchedAt }
}

export type RiskPref = 'lower' | 'balanced' | 'higher'

export interface Preferences {
  risk: RiskPref | null
  budgetMin: number | null
  budgetMax: number | null
  networks: string[]
}

export const DEFAULT_PREFS: Preferences = { risk: null, budgetMin: null, budgetMax: null, networks: [] }

export const RISK_LABEL: Record<RiskPref, string> = {
  lower: 'Lower Risk',
  balanced: 'Balanced',
  higher: 'Higher Risk',
}

export type Alignment = 'matches' | 'careful' | 'mismatch' | 'insufficient'

export const ALIGNMENT_LABEL: Record<Alignment, string> = {
  matches: 'Matches stated preferences',
  careful: 'Consider carefully',
  mismatch: 'Does not match stated preferences',
  insufficient: 'Insufficient evidence',
}

export type ResearchStatus = 'public-data-only' | 'telegraph-pending' | 'telegraph-complete' | 'telegraph-failed'

export const STATUS_LABEL: Record<ResearchStatus, string> = {
  'public-data-only': 'Public data only — Telegraph not connected',
  'telegraph-pending': 'Telegraph request pending',
  'telegraph-complete': 'Completed with Telegraph intelligence',
  'telegraph-failed': 'Telegraph request failed',
}

export interface ReportData {
  id: string
  createdAt: number
  status: ResearchStatus
  topics: string[]
  telegraphRef: string | null
  opportunity: PoolSnapshot & {
    apyBase: number | null
    apyReward: number | null
    apyMean30d: number | null
    apyPct7D: number | null
    stablecoin: boolean
    ilRisk: string
    exposure: string
    poolMeta: string | null
    underlyingTokens: string[] | null
  }
  protocol: {
    name: string | null
    category: string | null
    url: string | null
    audits: string | null
    auditLinks: string[]
    fetchedAt: number | null
    error: string | null
  }
  preferences: Preferences
  alignment: Alignment
  alignmentReasons: string[]
  missing: string[]
}

export function useWatchlist() {
  return useStored<PoolSnapshot[]>('watchlist', [])
}

export function useCompare() {
  return useStored<string[]>('compare', [])
}

export function usePrefs() {
  return useStored<Preferences>('prefs', DEFAULT_PREFS)
}

export function useReports() {
  return useStored<ReportData[]>('reports', [])
}

export const COMPARE_LIMIT = 4
