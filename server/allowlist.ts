import { readFileSync } from 'node:fs'

export type ParamType = 'string' | 'integer' | 'number' | 'bool' | 'enum' | 'date' | 'datetime'
export type FieldType = ParamType | 'list' | 'object'

export interface ParamSpec {
  name: string
  type: ParamType
  required: boolean
  allowed?: string[]
  min?: number
  max?: number
  pattern?: string
}

export interface FieldSpec {
  name: string
  type: FieldType
  allowed?: string[]
  range?: [number, number]
}

export interface IntentEntry {
  topic: string
  intent: string
  requestSchemaVersion: number
  responseFormatVersion: number
  params: ParamSpec[]
  fields: FieldSpec[]
  miners: { id: string; maxPriceUusdc: string }[]
}

export interface ProviderAllowlist {
  version: 1
  verifiedAt: string
  verificationSource: string
  node: { baseUrl: string }
  payment: {
    schemes: string[]
    network: string
    asset: string
    payTo: string
    maxTimeoutSeconds: number
  }
  intents: IntentEntry[]
}

export type AllowlistState =
  | { status: 'not_configured' }
  | { status: 'invalid'; problems: string[] }
  | { status: 'ready'; allowlist: ProviderAllowlist }

const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const ZERO = /^0x0{40}$/i
const CAIP2 = /^eip155:\d+$/
const PLACEHOLDER = /<[^>]*>|TODO|TBD|PLACEHOLDER|SET_AFTER/i
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/
const PARAM_TYPES: ParamType[] = ['string', 'integer', 'number', 'bool', 'enum', 'date', 'datetime']
const FIELD_TYPES: FieldType[] = [...PARAM_TYPES, 'list', 'object']

function hasPlaceholder(v: unknown): boolean {
  if (typeof v === 'string') return PLACEHOLDER.test(v)
  if (Array.isArray(v)) return v.some(hasPlaceholder)
  if (v && typeof v === 'object') return Object.values(v).some(hasPlaceholder)
  return false
}

export function validateAllowlist(raw: unknown): AllowlistState {
  const p: string[] = []
  const a = raw as Partial<ProviderAllowlist> | null
  if (!a || typeof a !== 'object') return { status: 'invalid', problems: ['not an object'] }
  if (hasPlaceholder(a)) p.push('contains placeholder values; fill only with live-verified data')
  if (a.version !== 1) p.push('version must be 1')
  if (typeof a.verifiedAt !== 'string' || Number.isNaN(Date.parse(a.verifiedAt))) p.push('verifiedAt must be an ISO date')
  if (typeof a.verificationSource !== 'string' || !a.verificationSource.trim()) p.push('verificationSource is required')
  if (!a.node || typeof a.node.baseUrl !== 'string' || !/^https:\/\/[^/]+$/.test(a.node.baseUrl)) p.push('node.baseUrl must be an https origin with no path')
  const pay = a.payment
  if (!pay) p.push('payment is required')
  else {
    if (!Array.isArray(pay.schemes) || !pay.schemes.length || pay.schemes.some((s) => typeof s !== 'string')) p.push('payment.schemes must be a non-empty string list')
    if (typeof pay.network !== 'string' || !CAIP2.test(pay.network)) p.push('payment.network must be a CAIP-2 eip155 id')
    for (const k of ['asset', 'payTo'] as const) {
      if (typeof pay[k] !== 'string' || !ADDRESS.test(pay[k]) || ZERO.test(pay[k])) p.push(`payment.${k} must be a non-zero address`)
    }
    if (!Number.isInteger(pay.maxTimeoutSeconds) || pay.maxTimeoutSeconds < 1 || pay.maxTimeoutSeconds > 300) p.push('payment.maxTimeoutSeconds must be 1–300')
  }
  if (!Array.isArray(a.intents)) p.push('intents must be a list')
  else {
    const topics = new Set<string>()
    a.intents.forEach((it, i) => {
      const at = `intents[${i}]`
      if (!it || typeof it !== 'object') return p.push(`${at} must be an object`)
      if (typeof it.topic !== 'string' || !it.topic) p.push(`${at}.topic is required`)
      else if (topics.has(it.topic)) p.push(`${at}.topic is duplicated`)
      else topics.add(it.topic)
      if (typeof it.intent !== 'string' || !NAME.test(it.intent)) p.push(`${at}.intent is invalid`)
      if (!Number.isInteger(it.requestSchemaVersion) || !Number.isInteger(it.responseFormatVersion)) p.push(`${at} schema versions must be integers`)
      if (!Array.isArray(it.params) || it.params.some((x) => !x || !NAME.test(x.name) || !PARAM_TYPES.includes(x.type))) p.push(`${at}.params are invalid`)
      if (!Array.isArray(it.fields) || !it.fields.length || it.fields.some((x) => !x || !NAME.test(x.name) || !FIELD_TYPES.includes(x.type))) p.push(`${at}.fields are invalid`)
      if (!Array.isArray(it.miners) || !it.miners.length || it.miners.some((m) => !m || !/^\d+$/.test(m.id) || !/^\d+$/.test(m.maxPriceUusdc))) p.push(`${at}.miners must list numeric ids with maxPriceUusdc`)
    })
  }
  return p.length ? { status: 'invalid', problems: p } : { status: 'ready', allowlist: a as ProviderAllowlist }
}

// Loads from PROVIDER_ALLOWLIST_JSON or PROVIDER_ALLOWLIST_PATH. Absent means not configured, which blocks all purchases.
export function loadAllowlist(env: Record<string, string | undefined> = process.env): AllowlistState {
  let text: string | undefined = env.PROVIDER_ALLOWLIST_JSON
  if (!text && env.PROVIDER_ALLOWLIST_PATH) {
    try {
      text = readFileSync(env.PROVIDER_ALLOWLIST_PATH, 'utf8')
    } catch {
      return { status: 'invalid', problems: ['allowlist file could not be read'] }
    }
  }
  if (!text) return { status: 'not_configured' }
  try {
    return validateAllowlist(JSON.parse(text))
  } catch {
    return { status: 'invalid', problems: ['allowlist is not valid JSON'] }
  }
}

export function intentForTopic(list: ProviderAllowlist, topic: string): IntentEntry | undefined {
  return list.intents.find((i) => i.topic === topic)
}
