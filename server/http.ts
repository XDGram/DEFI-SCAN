import type { IncomingMessage, ServerResponse } from 'node:http'
import { log } from './redact.js'

export interface ApiResult {
  status: number
  headers?: Record<string, string | string[]>
  body?: unknown
}

export const PRIVATE_NO_STORE: Record<string, string> = {
  'Cache-Control': 'no-store, private',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  Pragma: 'no-cache',
  Vary: 'Cookie, Authorization',
}

export function publicCache(seconds: number): Record<string, string> {
  return {
    'Cache-Control': `public, max-age=60, s-maxage=${seconds}, stale-while-revalidate=${seconds}`,
  }
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
}

const INBOUND_PAYMENT_HEADERS = ['payment-signature', 'x-payment', 'payment-required', 'x-telegraph-receipt']

// Users never pay this API, so any payment material arriving from a browser is refused outright.
export function inboundPaymentHeaderViolation(headers: IncomingMessage['headers']): string | null {
  for (const h of INBOUND_PAYMENT_HEADERS) if (headers[h] !== undefined) return h
  return null
}

export function errorResult(status: number, error: string, extra: Record<string, unknown> = {}, privateRoute = true): ApiResult {
  return { status, headers: privateRoute ? PRIVATE_NO_STORE : { 'Cache-Control': 'no-store' }, body: { error, ...extra } }
}

export function send(res: ServerResponse, result: ApiResult) {
  res.statusCode = result.status
  for (const [k, v] of Object.entries({ ...SECURITY_HEADERS, ...(result.headers ?? {}) })) res.setHeader(k, v)
  if (result.body === undefined) return res.end()
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(result.body))
}

const MAX_BODY = 32 * 1024

export async function readJson(req: IncomingMessage): Promise<unknown> {
  const pre = (req as IncomingMessage & { body?: unknown }).body
  if (pre !== undefined) return typeof pre === 'string' ? JSON.parse(pre) : pre
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > MAX_BODY) throw new Error('body_too_large')
    chunks.push(c as Buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : {}
}

export type Handler = (req: IncomingMessage) => Promise<ApiResult>

// Wraps every route: refuses inbound payment headers, enforces method, and logs only redacted metadata.
export function route(methods: string[], handler: Handler, opts: { privateRoute?: boolean } = {}) {
  const privateRoute = opts.privateRoute ?? true
  return async (req: IncomingMessage, res: ServerResponse) => {
    let result: ApiResult
    try {
      const bad = inboundPaymentHeaderViolation(req.headers)
      if (bad) result = errorResult(400, 'payment_headers_not_accepted', {}, privateRoute)
      else if (!methods.includes(req.method ?? '')) result = { ...errorResult(405, 'method_not_allowed', {}, privateRoute), headers: { ...(privateRoute ? PRIVATE_NO_STORE : {}), Allow: methods.join(', ') } }
      else result = await handler(req)
    } catch (e) {
      log.error('unhandled', { path: req.url?.split('?')[0], message: (e as Error).message })
      result = errorResult(500, 'internal_error', {}, privateRoute)
    }
    if (privateRoute) result = { ...result, headers: { ...(result.headers ?? {}), ...PRIVATE_NO_STORE } }
    send(res, result)
  }
}
