const B64 = /^[A-Za-z0-9+/]+={0,2}$/
const B64URL = /^[A-Za-z0-9_-]+={0,2}$/
export const MAX_HEADER_BYTES = 8 * 1024

export type HeaderValue = string | string[] | null | undefined

export class HeaderError extends Error {
  constructor(public code: 'missing' | 'duplicate' | 'too_large' | 'not_base64' | 'not_json' | 'invalid_shape', message?: string) {
    super(message ?? code)
  }
}

// Exactly one value, strict base64, bounded size, JSON object. Comma-joined duplicates are refused too.
export function decodeSingleBase64Json(value: HeaderValue): Record<string, unknown> {
  if (value === null || value === undefined || value === '') throw new HeaderError('missing')
  if (Array.isArray(value)) {
    if (value.length !== 1) throw new HeaderError('duplicate')
    value = value[0]
  }
  const v = value.trim()
  if (v.includes(',') || /\s/.test(v)) throw new HeaderError('duplicate')
  if (v.length > MAX_HEADER_BYTES) throw new HeaderError('too_large')
  if (!B64.test(v) && !B64URL.test(v)) throw new HeaderError('not_base64')
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(v, B64.test(v) ? 'base64' : 'base64url').toString('utf8'))
  } catch {
    throw new HeaderError('not_json')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new HeaderError('invalid_shape')
  return parsed as Record<string, unknown>
}
