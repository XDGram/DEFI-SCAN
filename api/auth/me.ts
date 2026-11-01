import { route } from '../../server/http.js'
import { withUser } from '../../server/routes.js'

export default route(['GET'], (req) => withUser(req, async ({ userId }) => ({ status: 200, body: { address: userId } })))
