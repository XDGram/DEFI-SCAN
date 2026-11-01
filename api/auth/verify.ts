import { loadConfig } from '../../server/config.js'
import { errorResult, route } from '../../server/http.js'
import { jsonBody, requestHost } from '../../server/routes.js'
import { verifySiwe } from '../../server/session.js'

export default route(['POST'], async (req) => {
  const cfg = loadConfig()
  if (!cfg.sessionSecret) return errorResult(503, 'sessions_not_configured')
  const body = await jsonBody(req)
  if (!body.ok) return body.result
  const out = await verifySiwe(cfg.sessionSecret, req, (body.value ?? {}) as object, requestHost(req))
  if (!out.ok) return errorResult(401, out.error)
  return { status: 200, headers: { 'Set-Cookie': out.setCookies }, body: { address: out.address } }
})
