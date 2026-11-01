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

export async function getDb(databaseUrl: string | null): Promise<Db | null> {
  if (!databaseUrl) return null
  if (shared) return shared
  const { default: pg } = await import('pg')
  shared = fromPgPool(new pg.Pool({ connectionString: databaseUrl, max: 3 }))
  return shared
}
