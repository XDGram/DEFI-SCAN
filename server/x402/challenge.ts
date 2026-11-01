import type { ProviderAllowlist } from '../allowlist.js'
import { decodeSingleBase64Json, HeaderError, type HeaderValue } from './headers.js'

export interface AcceptEntry {
  scheme: string
  network: string
  asset: string
  amount: bigint
  payTo: string
  maxTimeoutSeconds: number
  extra: Record<string, unknown>
}

export interface Challenge {
  x402Version: number
  resourceUrl: string
  accepts: AcceptEntry[]
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/

export function parseChallenge(header: HeaderValue): Challenge {
  const raw = decodeSingleBase64Json(header)
  const resource = raw.resource as { url?: unknown } | undefined
  if (typeof raw.x402Version !== 'number' || !resource || typeof resource.url !== 'string' || !Array.isArray(raw.accepts)) {
    throw new HeaderError('invalid_shape', 'challenge missing x402Version, resource.url or accepts')
  }
  const accepts: AcceptEntry[] = []
  for (const e of raw.accepts as Record<string, unknown>[]) {
    // Entries we cannot type-check (for example another scheme with its own fields) are kept out, never guessed.
    if (!e || typeof e !== 'object') continue
    const { scheme, network, asset, amount, payTo, maxTimeoutSeconds, extra } = e
    if (typeof scheme !== 'string' || typeof network !== 'string') continue
    if (typeof asset !== 'string' || !ADDRESS.test(asset)) continue
    if (typeof payTo !== 'string' || !ADDRESS.test(payTo)) continue
    if (typeof amount !== 'string' || !/^\d{1,30}$/.test(amount)) continue
    if (typeof maxTimeoutSeconds !== 'number' || !Number.isInteger(maxTimeoutSeconds)) continue
    accepts.push({
      scheme,
      network,
      asset,
      amount: BigInt(amount),
      payTo,
      maxTimeoutSeconds,
      extra: extra && typeof extra === 'object' ? (extra as Record<string, unknown>) : {},
    })
  }
  return { x402Version: raw.x402Version, resourceUrl: resource.url, accepts }
}

export type Refusal =
  | 'resource_mismatch'
  | 'no_allowed_scheme'
  | 'network_mismatch'
  | 'asset_mismatch'
  | 'pay_to_changed'
  | 'amount_over_quote'
  | 'amount_over_request_cap'
  | 'amount_over_miner_cap'
  | 'timeout_too_long'
  | 'zero_amount'

export interface SelectionContext {
  requestedUrl: string
  confirmedQuoteUusdc: bigint
  perRequestCapUusdc: bigint
  minerMaxPriceUusdc: bigint
}

export type Selection = { ok: true; accept: AcceptEntry } | { ok: false; refusals: Refusal[] }

const eqAddr = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

// Every condition must hold before anything is signed. A changed payTo fails closed and must be reviewed by an operator.
export function selectAccept(ch: Challenge, list: ProviderAllowlist, ctx: SelectionContext): Selection {
  if (ch.resourceUrl !== ctx.requestedUrl) return { ok: false, refusals: ['resource_mismatch'] }
  const candidates = ch.accepts.filter((a) => list.payment.schemes.includes(a.scheme))
  if (!candidates.length) return { ok: false, refusals: ['no_allowed_scheme'] }
  let best: Refusal[] = []
  for (const a of candidates) {
    const r: Refusal[] = []
    if (a.network !== list.payment.network) r.push('network_mismatch')
    if (!eqAddr(a.asset, list.payment.asset)) r.push('asset_mismatch')
    if (!eqAddr(a.payTo, list.payment.payTo)) r.push('pay_to_changed')
    if (a.amount === 0n) r.push('zero_amount')
    if (a.amount > ctx.confirmedQuoteUusdc) r.push('amount_over_quote')
    if (a.amount > ctx.perRequestCapUusdc) r.push('amount_over_request_cap')
    if (a.amount > ctx.minerMaxPriceUusdc) r.push('amount_over_miner_cap')
    if (a.maxTimeoutSeconds > list.payment.maxTimeoutSeconds) r.push('timeout_too_long')
    if (!r.length) return { ok: true, accept: a }
    if (!best.length || r.length < best.length) best = r
  }
  return { ok: false, refusals: best }
}
