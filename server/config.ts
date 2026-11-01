export interface SpendCaps {
  perRequestUusdc: bigint
  perUserDailyUusdc: bigint
  globalDailyUusdc: bigint
  globalTotalUusdc: bigint
}

export interface ServerConfig {
  paymentsEnabled: boolean
  caps: SpendCaps
  sessionSecret: string | null
  siweChainId: number
  database: { url: string; caCert: string | null; sslDisabled: boolean } | null
  defillama: { yieldsBase: string; usesKey: boolean }
}

type Env = Record<string, string | undefined>

function uusdc(env: Env, name: string): bigint {
  const raw = env[name]
  if (raw === undefined || raw === '') return 0n
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a non-negative integer amount in uUSDC`)
  return BigInt(raw)
}

const LEGACY_YIELDS_BASE = 'https://yields.llama.fi'
const DEFAULT_SIWE_CHAIN_ID = 11155111

function siweChainId(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_SIWE_CHAIN_ID
  if (!/^[1-9]\d{0,15}$/.test(raw)) throw new Error('SIWE_CHAIN_ID must be a positive integer chain ID')
  return Number(raw)
}

export function loadConfig(env: Env = process.env): ServerConfig {
  const key = env.DEFILLAMA_API_KEY?.trim()
  const template = env.DEFILLAMA_YIELDS_BASE_TEMPLATE?.trim()
  let yieldsBase = LEGACY_YIELDS_BASE
  if (key && template) {
    if (!template.includes('{key}')) throw new Error('DEFILLAMA_YIELDS_BASE_TEMPLATE must contain {key}')
    yieldsBase = template.replace('{key}', encodeURIComponent(key))
  }
  return {
    // Fail closed: payments stay off unless explicitly enabled and every cap is set.
    paymentsEnabled: env.PAYMENTS_ENABLED === 'true',
    caps: {
      perRequestUusdc: uusdc(env, 'CAP_PER_REQUEST_UUSDC'),
      perUserDailyUusdc: uusdc(env, 'CAP_PER_USER_DAILY_UUSDC'),
      globalDailyUusdc: uusdc(env, 'CAP_GLOBAL_DAILY_UUSDC'),
      globalTotalUusdc: uusdc(env, 'CAP_GLOBAL_TOTAL_UUSDC'),
    },
    sessionSecret: env.SESSION_SECRET && env.SESSION_SECRET.length >= 32 ? env.SESSION_SECRET : null,
    siweChainId: siweChainId(env.SIWE_CHAIN_ID),
    database: env.DATABASE_URL
      ? {
          url: env.DATABASE_URL,
          caCert: env.DATABASE_CA_CERT ? env.DATABASE_CA_CERT.replace(/\\n/g, '\n') : null,
          // Only for a local database without TLS. Never set this in Vercel.
          sslDisabled: env.DATABASE_SSL === 'disable',
        }
      : null,
    defillama: { yieldsBase, usesKey: Boolean(key && template) },
  }
}
