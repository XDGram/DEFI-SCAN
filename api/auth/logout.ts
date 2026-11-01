import { route } from '../../server/http.js'
import { clearSessionCookie } from '../../server/session.js'

export default route(['POST'], async () => ({ status: 204, headers: { 'Set-Cookie': clearSessionCookie() } }))
