import { loadConfig } from '../../server/config.js'
import { errorResult, route } from '../../server/http.js'
import { issueNonce } from '../../server/session.js'

export default route(['GET'], async () => {
  const cfg = loadConfig()
  if (!cfg.sessionSecret) return errorResult(503, 'sessions_not_configured')
  const { nonce, setCookie } = issueNonce(cfg.sessionSecret)
  return { status: 200, headers: { 'Set-Cookie': setCookie }, body: { nonce } }
})
