import { loadConfig } from '../../server/config.js'
import { errorResult, route } from '../../server/http.js'
import { siweExpectation } from '../../server/routes.js'
import { issueNonce } from '../../server/session.js'

export default route(['GET'], async (req) => {
  const cfg = loadConfig()
  if (!cfg.sessionSecret) return errorResult(503, 'sessions_not_configured')
  const { nonce, setCookie } = issueNonce(cfg.sessionSecret)
  const expected = siweExpectation(req, cfg)
  // The client builds its message from these exact values; /api/auth/verify checks the same ones.
  return {
    status: 200,
    headers: { 'Set-Cookie': setCookie },
    body: { nonce, domain: expected.domain, uri: expected.origin, chainId: expected.chainId, version: '1' },
  }
})
