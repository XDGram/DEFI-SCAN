// TEMPORARY — remove after the Supabase connection has been verified on the preview deployment.
// Backs GET /api/health/database. Runs only `SELECT 1`; never returns or logs connection details.
import type { IncomingMessage } from 'node:http'
import type { Db } from './db/db.js'
import { errorResult, type ApiResult } from './http.js'
import { log } from './redact.js'
import { sessionUser } from './session.js'

const TIMEOUT_MS = 5_000

function errorCode(e: unknown): string {
  // Only the short error code (for example ECONNREFUSED, 28P01, SELF_SIGNED_CERT_IN_CHAIN) is logged.
  // Messages are dropped because they can contain hostnames or connection details.
  const code = (e as { code?: unknown } | null)?.code
  return typeof code === 'string' && /^[A-Z0-9_]{2,40}$/i.test(code) ? code : 'unknown'
}

export async function checkDatabase(getDb: () => Promise<Db | null>, timeoutMs = TIMEOUT_MS): Promise<ApiResult> {
  const unavailable: ApiResult = { status: 503, body: { database: 'unavailable' } }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const db = await getDb()
    if (!db) {
      log.warn('health_database', { result: 'unavailable', reason: 'not_configured' })
      return unavailable
    }
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })), timeoutMs)
    })
    const r = await Promise.race([db.query<{ ok: number }>('SELECT 1 AS ok'), timeout])
    if (Number(r.rows[0]?.ok) !== 1) {
      log.warn('health_database', { result: 'unavailable', reason: 'unexpected_result' })
      return unavailable
    }
    log.info('health_database', { result: 'connected' })
    return { status: 200, body: { database: 'connected' } }
  } catch (e) {
    log.warn('health_database', { result: 'unavailable', code: errorCode(e) })
    return unavailable
  } finally {
    clearTimeout(timer)
  }
}

export async function databaseHealthRoute(
  req: IncomingMessage,
  deps: { sessionSecret: string | null; getDb: () => Promise<Db | null>; timeoutMs?: number },
): Promise<ApiResult> {
  if (!deps.sessionSecret) return errorResult(503, 'sessions_not_configured')
  if (!sessionUser(deps.sessionSecret, req)) return errorResult(401, 'sign_in_required')
  return checkDatabase(deps.getDb, deps.timeoutMs)
}
