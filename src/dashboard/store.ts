import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
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
  assets: string[]
  minApy: number | null
  minTvl: number | null
  stableOnly: boolean
  hideNonMatching: boolean
}

export const DEFAULT_PREFS: Preferences = {
  risk: null,
  budgetMin: null,
  budgetMax: null,
  networks: [],
  assets: [],
  minApy: null,
  minTvl: null,
  stableOnly: false,
  hideNonMatching: false,
}

function assetMatches(symbol: string, asset: string) {
  const a = asset.toUpperCase()
  return symbol
    .toUpperCase()
    .split(/[-/ ]+/)
    .some((t) => t === a || (a.length >= 3 && t.endsWith(a)))
}

export function hasResearchPrefs(p: Preferences) {
  return p.networks.length > 0 || p.assets.length > 0
}

export function matchesResearchPrefs(pool: { chain: string; symbol: string }, p: Preferences) {
  if (p.networks.length && !p.networks.includes(pool.chain)) return false
  if (p.assets.length && !p.assets.some((a) => assetMatches(pool.symbol, a))) return false
  return true
}

export function passesOpportunityPrefs(pool: { apy: number | null; tvlUsd: number; stablecoin: boolean }, p: Preferences) {
  if (p.minApy != null && (pool.apy == null || pool.apy < p.minApy)) return false
  if (p.minTvl != null && pool.tvlUsd < p.minTvl) return false
  if (p.stableOnly && !pool.stablecoin) return false
  return true
}

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

export function usePrefs(): [Preferences, (v: Preferences) => void] {
  const [raw, set] = useStored<Partial<Preferences>>('prefs', DEFAULT_PREFS)
  const prefs = useMemo(() => ({ ...DEFAULT_PREFS, ...raw }), [raw])
  return [prefs, set as (v: Preferences) => void]
}

export type ThemePref = 'system' | 'light' | 'dark'

export function useThemePref() {
  return useStored<ThemePref>('theme', 'system')
}

export function useResolvedTheme(): 'light' | 'dark' {
  const [pref] = useThemePref()
  const query = '(prefers-color-scheme: dark)'
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return pref === 'system' ? (systemDark ? 'dark' : 'light') : pref
}

export function useReports() {
  return useStored<ReportData[]>('reports', [])
}

export const COMPARE_LIMIT = 4
