import { loadConfig } from '../../server/config.js'
import { marketPools } from '../../server/defillama.js'
import { route } from '../../server/http.js'

export default route(['GET'], async () => marketPools(loadConfig()), { privateRoute: false })
