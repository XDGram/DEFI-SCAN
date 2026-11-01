const SENSITIVE_HEADERS = new Set([
  'payment-signature',
  'x-payment',
  'payment-required',
  'payment-response',
  'x-payment-response',
  'x-telegraph-receipt',
  'authorization',
  'cookie',
  'set-cookie',
])

const SENSITIVE_KEYS = /(signature|private.?key|secret|password|token|authorization|cookie|payment.?payload|api.?key)/i
const HEX_KEY = /0x[0-9a-fA-F]{64}\b/g
const LONG_B64 = /\b[A-Za-z0-9+/_-]{80,}={0,2}/g
const LLAMA_KEY_PATH = /(pro-api\.llama\.fi\/)[^/\s]+/g

export const REDACTED = '[REDACTED]'

export function redactString(s: string): string {
  return s.replace(LLAMA_KEY_PATH, `$1${REDACTED}`).replace(HEX_KEY, REDACTED).replace(LONG_B64, REDACTED)
}

export function redactHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SENSITIVE_HEADERS.has(k.toLowerCase()) ? REDACTED : typeof v === 'string' ? redactString(v) : v
  }
  return out
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return REDACTED
  if (typeof value === 'string') return redactString(value)
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEYS.test(k) || SENSITIVE_HEADERS.has(k.toLowerCase()) ? REDACTED : redact(v, depth + 1)
    }
    return out
  }
  return value
}

// Returns only a short, upper-case error code (for example 28P01, ECONNREFUSED, SELF_SIGNED_CERT_IN_CHAIN).
// Messages, stacks and anything else are dropped: they can contain hostnames, credentials or connection strings.
export function safeErrorCode(e: unknown): string {
  const code = e !== null && typeof e === 'object' ? (e as { code?: unknown }).code : undefined
  return typeof code === 'string' && /^[A-Z0-9_]{2,40}$/.test(code) ? code : 'unknown'
}

type Level = 'info' | 'warn' | 'error'

// The only logger server code may use: everything passes through redact().
export const log = {
  emit(level: Level, event: string, fields: Record<string, unknown> = {}) {
    const line = JSON.stringify({ level, event, ...(redact(fields) as object), t: new Date().toISOString() })
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
  },
  info: (e: string, f?: Record<string, unknown>) => log.emit('info', e, f),
  warn: (e: string, f?: Record<string, unknown>) => log.emit('warn', e, f),
  error: (e: string, f?: Record<string, unknown>) => log.emit('error', e, f),
}
