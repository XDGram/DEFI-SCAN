import type { IncomingMessage } from 'node:http'
import { loadAllowlist } from './allowlist.js'
import { loadConfig } from './config.js'
import { getDb } from './db/db.js'
import { errorResult, readJson, type ApiResult } from './http.js'
import { sessionUser } from './session.js'

export function pathParam(req: IncomingMessage, prefix: string): string {
  const path = new URL(req.url ?? '/', 'http://local').pathname
  return path.startsWith(prefix) ? decodeURIComponent(path.slice(prefix.length)).replace(/\/$/, '') : ''
}

export function requestHost(req: IncomingMessage): string {
  const h = req.headers['x-forwarded-host'] ?? req.headers.host ?? ''
  return (Array.isArray(h) ? h[0] : h).split(',')[0].trim()
}

// HTTPS everywhere except a local development host.
export function requestOrigin(req: IncomingMessage): string {
  const host = requestHost(req)
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
  const proto = req.headers['x-forwarded-proto']
  const p = (Array.isArray(proto) ? proto[0] : proto ?? '').split(',')[0].trim()
  return `${local && p === 'http' ? 'http' : 'https'}://${host}`
}

export async function withUser(req: IncomingMessage, fn: (ctx: { userId: string; cfg: ReturnType<typeof loadConfig> }) => Promise<ApiResult>): Promise<ApiResult> {
  const cfg = loadConfig()
  if (!cfg.sessionSecret) return errorResult(503, 'sessions_not_configured')
  const userId = sessionUser(cfg.sessionSecret, req)
  if (!userId) return errorResult(401, 'sign_in_required')
  return fn({ userId, cfg })
}

export async function deps(cfg: ReturnType<typeof loadConfig>) {
  return { db: await getDb(cfg.database), allowlist: loadAllowlist() }
}

export async function jsonBody(req: IncomingMessage): Promise<{ ok: true; value: unknown } | { ok: false; result: ApiResult }> {
  try {
    return { ok: true, value: await readJson(req) }
  } catch {
    return { ok: false, result: errorResult(400, 'invalid_json') }
  }
}
