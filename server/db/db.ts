import { log } from '../redact.js'

export interface Query {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>
}

export interface Db extends Query {
  transaction<R>(fn: (q: Query) => Promise<R>): Promise<R>
}

interface PgPoolLike {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>
  connect(): Promise<{ query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>; release(): void }>
}

export function fromPgPool(pool: PgPoolLike): Db {
  return {
    query: (t, p) => pool.query(t, p) as never,
    async transaction(fn) {
      const c = await pool.connect()
      try {
        await c.query('BEGIN')
        const r = await fn({ query: (t, p) => c.query(t, p) as never })
        await c.query('COMMIT')
        return r
      } catch (e) {
        await c.query('ROLLBACK')
        throw e
      } finally {
        c.release()
      }
    },
  }
}

let shared: Db | null = null

export interface DbConnectionConfig {
  url: string
  caCert: string | null
  sslDisabled: boolean
}

// Modes that would allow plaintext or skip certificate checks. libpq's "require" also skips verification,
// but only in libpq-compat mode, which is refused below.
const WEAK_SSLMODES = new Set(['disable', 'allow', 'prefer', 'no-verify'])

// TLS is always configured explicitly so URL parameters cannot weaken it. The server certificate is verified
// (chain and hostname): against DATABASE_CA_CERT when provided, otherwise against Node's public CA store.
// sslmode=require/verify-ca/verify-full in the URL is accepted and means exactly that verified TLS.
export function connectionOptions(c: DbConnectionConfig) {
  const u = new URL(c.url)
  const mode = u.searchParams.get('sslmode')
  if (u.searchParams.get('uselibpqcompat') === 'true') throw new Error('uselibpqcompat is not allowed: it disables certificate verification for sslmode=require')
  if (mode && WEAK_SSLMODES.has(mode) && !c.sslDisabled) throw new Error(`sslmode=${mode} is not allowed: TLS with certificate verification is required`)
  for (const k of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat']) u.searchParams.delete(k)
  if (c.sslDisabled) return { connectionString: u.toString(), ssl: false as const }
  return { connectionString: u.toString(), ssl: c.caCert ? { ca: c.caCert, rejectUnauthorized: true } : { rejectUnauthorized: true } }
}

export function tlsVerificationSource(c: DbConnectionConfig): 'pinned_ca' | 'public_ca_store' | 'disabled' {
  return c.sslDisabled ? 'disabled' : c.caCert ? 'pinned_ca' : 'public_ca_store'
}

export async function getDb(c: DbConnectionConfig | null): Promise<Db | null> {
  if (!c) return null
  if (shared) return shared
  const { default: pg } = await import('pg')
  // Small pool: serverless instances should hold few connections; the Supabase pooler multiplexes them.
  shared = fromPgPool(new pg.Pool({ ...connectionOptions(c), max: 2, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000 }))
  log.info('db_pool_created', { tls_verification: tlsVerificationSource(c) })
  return shared
}
