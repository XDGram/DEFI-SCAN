import { loadConfig } from '../../server/config.js'
import { getDb } from '../../server/db/db.js'
import { errorResult, route } from '../../server/http.js'
import { log, safeErrorCode } from '../../server/redact.js'
import { jsonBody, requestHost, requestOrigin } from '../../server/routes.js'
import { pgNonceStore, verifySiwe } from '../../server/session.js'

export default route(['POST'], async (req) => {
  const cfg = loadConfig()
  if (!cfg.sessionSecret) return errorResult(503, 'sessions_not_configured')
  const body = await jsonBody(req)
  if (!body.ok) return body.result
  // Single-use nonces need shared storage; without the database, sign-in fails closed.
  const db = await getDb(cfg.database).catch((e: unknown) => {
    log.warn('siwe_nonce_store_unavailable', { stage: 'connect', code: safeErrorCode(e) })
    return null
  })
  if (!db) {
    if (!cfg.database) log.warn('siwe_nonce_store_unavailable', { stage: 'connect', code: 'NOT_CONFIGURED' })
    return errorResult(503, 'nonce_store_unavailable')
  }
  const out = await verifySiwe(
    cfg.sessionSecret,
    req,
    (body.value ?? {}) as object,
    { domain: requestHost(req), origin: requestOrigin(req), chainId: cfg.siweChainId },
    pgNonceStore(db),
  )
  if (!out.ok) return errorResult(out.error === 'nonce_store_unavailable' ? 503 : 401, out.error)
  return { status: 200, headers: { 'Set-Cookie': out.setCookies }, body: { address: out.address } }
})
