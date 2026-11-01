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

// sslmode in the URL would override the TLS settings below, so it is stripped and TLS is configured explicitly.
export function connectionOptions(c: DbConnectionConfig) {
  const u = new URL(c.url)
  for (const k of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat']) u.searchParams.delete(k)
  if (c.sslDisabled) return { connectionString: u.toString(), ssl: false as const }
  if (!c.caCert) throw new Error('DATABASE_CA_CERT is required: TLS must verify the database server certificate')
  return { connectionString: u.toString(), ssl: { ca: c.caCert, rejectUnauthorized: true } }
}

export async function getDb(c: DbConnectionConfig | null): Promise<Db | null> {
  if (!c) return null
  if (shared) return shared
  const { default: pg } = await import('pg')
  // Small pool: serverless instances should hold few connections; the Supabase pooler multiplexes them.
  shared = fromPgPool(new pg.Pool({ ...connectionOptions(c), max: 2, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000 }))
  return shared
}
