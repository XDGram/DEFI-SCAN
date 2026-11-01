import { loadConfig } from '../../../server/config.js'
import { marketChart } from '../../../server/defillama.js'
import { route } from '../../../server/http.js'
import { pathParam } from '../../../server/routes.js'

export default route(['GET'], async (req) => marketChart(loadConfig(), pathParam(req, '/api/market/chart/')), { privateRoute: false })
