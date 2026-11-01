import { describe, expect, it } from 'vitest'
import { loadConfig } from '../server/config.js'
import { connectionOptions, tlsVerificationSource } from '../server/db/db.js'
import { testDb } from './helpers.js'

const URL_ = 'postgresql://user:pw@db.invalid:6543/postgres?sslmode=require&pgbouncer=true'
const CA = '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----'

describe('database connection (server-side only)', () => {
  it('pins the CA when provided; otherwise still verifies against the public CA store', () => {
    expect(connectionOptions({ url: URL_, caCert: CA, sslDisabled: false }).ssl).toEqual({ ca: CA, rejectUnauthorized: true })
    expect(connectionOptions({ url: URL_, caCert: null, sslDisabled: false }).ssl).toEqual({ rejectUnauthorized: true })
    expect(tlsVerificationSource({ url: URL_, caCert: null, sslDisabled: false })).toBe('public_ca_store')
    expect(tlsVerificationSource({ url: URL_, caCert: CA, sslDisabled: false })).toBe('pinned_ca')
  })

  it('accepts sslmode=require/verify-full but never produces rejectUnauthorized=false', () => {
    for (const mode of ['require', 'verify-ca', 'verify-full']) {
      const o = connectionOptions({ url: URL_.replace('require', mode), caCert: null, sslDisabled: false })
      expect(o.ssl).toEqual({ rejectUnauthorized: true })
    }
  })

  it('refuses modes and flags that would weaken TLS', () => {
    for (const mode of ['disable', 'allow', 'prefer', 'no-verify']) {
      expect(() => connectionOptions({ url: URL_.replace('require', mode), caCert: null, sslDisabled: false })).toThrow(/not allowed/)
    }
    expect(() => connectionOptions({ url: URL_ + '&uselibpqcompat=true', caCert: null, sslDisabled: false })).toThrow(/uselibpqcompat/)
  })

  it('strips sslmode from the URL so it cannot weaken TLS settings', () => {
    const o = connectionOptions({ url: URL_, caCert: CA, sslDisabled: false })
    expect(o.connectionString).not.toContain('sslmode')
    expect(o.connectionString).toContain('pgbouncer=true')
  })

  it('reads DATABASE_* from env and accepts a CA with escaped newlines', () => {
    const c = loadConfig({ DATABASE_URL: URL_, DATABASE_CA_CERT: CA.replace(/\n/g, '\\n') })
    expect(c.database?.caCert).toBe(CA)
    expect(c.database?.sslDisabled).toBe(false)
    expect(loadConfig({}).database).toBeNull()
  })

  it('enables row level security on every table (blocks Supabase Data API roles)', async () => {
    const db = await testDb()
    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT relname, relrowsecurity FROM pg_class WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace ORDER BY relname`,
    )
    expect(r.rows.map((x) => x.relname)).toEqual(['payment_events', 'research_requests', 'research_results', 'spend_reservations', 'system_flags', 'telegraph_payments'])
    expect(r.rows.every((x) => x.relrowsecurity)).toBe(true)
  })
})
