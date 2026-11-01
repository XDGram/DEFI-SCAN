import { route } from '../../server/http.js'
import { createResearch, listResearch } from '../../server/research/service.js'
import { deps, jsonBody, withUser } from '../../server/routes.js'

export default route(['GET', 'POST'], (req) =>
  withUser(req, async ({ userId, cfg }) => {
    const d = await deps(cfg)
    if (req.method === 'GET') return listResearch(d.db, userId)
    const body = await jsonBody(req)
    if (!body.ok) return body.result
    const key = req.headers['idempotency-key']
    return createResearch(d, userId, Array.isArray(key) ? undefined : key, body.value)
  }),
)
