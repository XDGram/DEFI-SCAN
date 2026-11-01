// TEMPORARY — remove after the Supabase connection has been verified on the preview deployment.
import { loadConfig } from '../../server/config.js'
import { getDb } from '../../server/db/db.js'
import { databaseHealthRoute } from '../../server/health.js'
import { route } from '../../server/http.js'

export default route(['GET'], (req) => {
  const cfg = loadConfig()
  return databaseHealthRoute(req, { sessionSecret: cfg.sessionSecret, getDb: () => getDb(cfg.database) })
})
