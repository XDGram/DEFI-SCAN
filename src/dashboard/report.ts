import type { LlamaPool, ProtocolInfo } from './data'
import { Alignment, matchesResearchPrefs, Preferences, ReportData, snapshotOf } from './store'

export const RESEARCH_TOPICS = [
  { id: 'audits', label: 'Audit history and security incidents' },
  { id: 'contracts', label: 'Smart contract and protocol risks' },
  { id: 'liquidity', label: 'Liquidity depth and exit capacity' },
  { id: 'withdrawal', label: 'Withdrawal conditions and lock-ups' },
  { id: 'fees', label: 'Deposit, withdrawal and performance fees' },
  { id: 'yield-source', label: 'Source and sustainability of the yield' },
]

const ALWAYS_MISSING = [
  'Fees (not provided by DefiLlama pool data)',
  'Withdrawal conditions and lock-up periods',
  'Available liquidity beyond TVL',
  'Telegraph intelligence (integration not connected)',
]

export function evaluateAlignment(
  pool: LlamaPool,
  prefs: Preferences,
  auditsKnown: boolean,
  hasIntelligence: boolean,
): { alignment: Alignment; reasons: string[] } {
  const reasons: string[] = []
  const noPrefs =
    !prefs.risk && !prefs.networks.length && !prefs.assets.length && prefs.budgetMax == null && prefs.budgetMin == null
  if (noPrefs) {
    return { alignment: 'insufficient', reasons: ['No preferences are set. Add them in Settings to evaluate alignment.'] }
  }

  if (prefs.networks.length && !prefs.networks.includes(pool.chain)) {
    reasons.push(`${pool.chain} is not one of your preferred networks (${prefs.networks.join(', ')}).`)
    return { alignment: 'mismatch', reasons }
  }
  if (prefs.networks.length) reasons.push(`${pool.chain} is one of your preferred networks.`)

  if (prefs.assets.length) {
    if (!matchesResearchPrefs({ chain: pool.chain, symbol: pool.symbol }, { ...prefs, networks: [] })) {
      reasons.push(`${pool.symbol} does not include any of your preferred assets (${prefs.assets.join(', ')}).`)
      return { alignment: 'mismatch', reasons }
    }
    reasons.push(`${pool.symbol} includes one of your preferred assets.`)
  }

  if (prefs.budgetMax != null && pool.tvlUsd > 0) {
    const share = (prefs.budgetMax / pool.tvlUsd) * 100
    reasons.push(
      `Derived: your maximum budget would be about ${share < 0.01 ? '<0.01' : share.toFixed(2)}% of the pool's TVL.${
        share > 1 ? ' A position this size relative to the pool may be harder to exit.' : ''
      }`,
    )
  }

  const cautions: string[] = []
  if (prefs.risk === 'lower') {
    if (!pool.stablecoin) cautions.push('The pool is not a stablecoin pool, so the asset price can move.')
    if (pool.ilRisk === 'yes') cautions.push('DefiLlama flags impermanent-loss exposure.')
    if ((pool.apyReward ?? 0) > (pool.apyBase ?? 0)) cautions.push('Most of the APY comes from reward tokens, which can change or end.')
  }
  if (prefs.risk === 'balanced' && pool.ilRisk === 'yes' && !pool.stablecoin) {
    cautions.push('Impermanent-loss exposure on a non-stablecoin pool.')
  }
  reasons.push(...cautions)

  if (!hasIntelligence || !auditsKnown) {
    reasons.push(
      'Key evidence is missing: fees, withdrawal conditions and liquidity depth are unavailable' +
        (auditsKnown ? '' : ', and audit information could not be confirmed') +
        '. A conclusion beyond this would not be supported.',
    )
    return { alignment: cautions.length ? 'careful' : 'insufficient', reasons }
  }
  return { alignment: cautions.length ? 'careful' : 'matches', reasons }
}

export function buildReport(args: {
  pool: LlamaPool
  fetchedAt: number
  protocol: { info: ProtocolInfo | null; fetchedAt: number | null; error: string | null }
  prefs: Preferences
  topics: string[]
}): ReportData {
  const { pool, fetchedAt, protocol, prefs, topics } = args
  const auditLinks = protocol.info?.audit_links ?? []
  const auditsKnown = protocol.info?.audits != null || auditLinks.length > 0
  const { alignment, reasons } = evaluateAlignment(pool, prefs, auditsKnown, false)

  const missing = [...ALWAYS_MISSING]
  if (!auditsKnown) missing.push('Audit information')
  if (pool.apyMean30d == null) missing.push('30-day average APY')
  if (protocol.error) missing.push(`Protocol details (request failed: ${protocol.error})`)

  return {
    id: `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
    status: 'public-data-only',
    topics,
    telegraphRef: null,
    opportunity: {
      ...snapshotOf(pool, fetchedAt),
      apyBase: pool.apyBase,
      apyReward: pool.apyReward,
      apyMean30d: pool.apyMean30d,
      apyPct7D: pool.apyPct7D,
      stablecoin: pool.stablecoin,
      ilRisk: pool.ilRisk,
      exposure: pool.exposure,
      poolMeta: pool.poolMeta,
      underlyingTokens: pool.underlyingTokens,
    },
    protocol: {
      name: protocol.info?.name ?? null,
      category: protocol.info?.category ?? null,
      url: protocol.info?.url ?? null,
      audits: protocol.info?.audits ?? null,
      auditLinks,
      fetchedAt: protocol.fetchedAt,
      error: protocol.error,
    },
    preferences: prefs,
    alignment,
    alignmentReasons: reasons,
    missing,
  }
}
