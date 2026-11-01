import { route } from '../../server/http.js'
import { getResearch } from '../../server/research/service.js'
import { deps, pathParam, withUser } from '../../server/routes.js'

export default route(['GET'], (req) =>
  withUser(req, async ({ userId, cfg }) => getResearch((await deps(cfg)).db, userId, pathParam(req, '/api/research/'))),
)
