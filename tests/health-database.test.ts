// Tests for the TEMPORARY /api/health/database endpoint — remove together with the endpoint.
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '../server/db/db.js'
import { databaseHealthRoute } from '../server/health.js'
import { route } from '../server/http.js'
import { createHmac } from 'node:crypto'
import { testDb } from './helpers.js'

const SECRET = 's'.repeat(48)
const SECRET_URL = 'postgresql://postgres.ref:SuperSecretPw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres'

function sessionCookie(address: string) {
  const payload = Buffer.from(JSON.stringify({ address, exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url')
  return `dos_session=${payload}.${createHmac('sha256', SECRET).update(payload).digest('base64url')}`
}

function request(cookie?: string) {
  const r = new IncomingMessage(new Socket())
  r.method = 'GET'
  r.url = '/api/health/database'
  r.headers = cookie ? { cookie } : {}
  return r
}

async function call(deps: Parameters<typeof databaseHealthRoute>[1], cookie?: string) {
  const req = request(cookie)
  const res = new ServerResponse(req)
  let body = ''
  res.end = ((c?: string) => {
    body = c ?? ''
    return res
  }) as never
  await route(['GET'], (r) => databaseHealthRoute(r, deps))(req, res)
  return { status: res.statusCode, headers: res.getHeaders(), body: body ? JSON.parse(body) : undefined, raw: body }
}

const failingDb = (err: Error & { code?: string }): Db => ({
  query: async () => {
    throw err
  },
  transaction: async () => {
    throw err
  },
})

describe('GET /api/health/database (temporary)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns connected for a working database, with private no-store headers', async () => {
    const db = await testDb()
    const spy = vi.spyOn(db, 'query')
    const r = await call({ sessionSecret: SECRET, getDb: async () => db }, sessionCookie('0x' + '1'.repeat(40)))
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ database: 'connected' })
    expect(r.headers['cache-control']).toBe('no-store, private')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe('SELECT 1 AS ok')
  })

  it('returns only "unavailable" on failure and never leaks error details in the response or logs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const err = Object.assign(new Error(`connect failed to ${SECRET_URL} (aws-0-eu-west-1.pooler.supabase.com)`), { code: 'ECONNREFUSED', stack: 'at secret/stack' })
    const r = await call({ sessionSecret: SECRET, getDb: async () => failingDb(err) }, sessionCookie('0x' + '1'.repeat(40)))
    expect(r.status).toBe(503)
    expect(r.body).toEqual({ database: 'unavailable' })
    const logged = warn.mock.calls.map((c) => String(c[0])).join('\n')
    for (const leak of ['SuperSecretPw', 'pooler.supabase.com', 'postgresql://', 'secret/stack']) {
      expect(r.raw).not.toContain(leak)
      expect(logged).not.toContain(leak)
    }
    expect(logged).toContain('ECONNREFUSED')
  })

  it('returns unavailable when the connection cannot be configured (e.g. a refused sslmode)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await call(
      { sessionSecret: SECRET, getDb: async () => { throw new Error(`sslmode=disable is not allowed for ${SECRET_URL}`) } },
      sessionCookie('0x' + '1'.repeat(40)),
    )
    expect(r.body).toEqual({ database: 'unavailable' })
    expect(r.raw).not.toContain('SuperSecretPw')
  })

  it('returns unavailable when DATABASE_URL is not configured', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await call({ sessionSecret: SECRET, getDb: async () => null }, sessionCookie('0x' + '1'.repeat(40)))
    expect(r.status).toBe(503)
    expect(r.body).toEqual({ database: 'unavailable' })
  })

  it('times out a hanging database as unavailable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const hanging: Db = { query: () => new Promise(() => {}), transaction: () => new Promise(() => {}) }
    const r = await call({ sessionSecret: SECRET, getDb: async () => hanging, timeoutMs: 50 }, sessionCookie('0x' + '1'.repeat(40)))
    expect(r.body).toEqual({ database: 'unavailable' })
  })

  it('rejects unauthenticated, tampered and wrong-secret sessions without touching the database', async () => {
    const getDb = vi.fn(async () => testDb())
    const none = await call({ sessionSecret: SECRET, getDb })
    const tampered = await call({ sessionSecret: SECRET, getDb }, sessionCookie('0x' + '1'.repeat(40)).replace(/\.(.)/, '.X$1'))
    const other = await call({ sessionSecret: 'o'.repeat(48), getDb }, sessionCookie('0x' + '1'.repeat(40)))
    for (const r of [none, tampered, other]) {
      expect(r.status).toBe(401)
      expect(r.body).toEqual({ error: 'sign_in_required' })
    }
    expect(getDb).not.toHaveBeenCalled()
  })

  it('reports sessions not configured when SESSION_SECRET is missing', async () => {
    const getDb = vi.fn()
    const r = await call({ sessionSecret: null, getDb }, sessionCookie('0x' + '1'.repeat(40)))
    expect(r.status).toBe(503)
    expect(getDb).not.toHaveBeenCalled()
  })

  it('refuses inbound payment headers before checking the session or database', async () => {
    const getDb = vi.fn()
    const req = request(sessionCookie('0x' + '1'.repeat(40)))
    req.headers['payment-signature'] = 'abc'
    const res = new ServerResponse(req)
    let body = ''
    res.end = ((c?: string) => {
      body = c ?? ''
      return res
    }) as never
    await route(['GET'], (r) => databaseHealthRoute(r, { sessionSecret: SECRET, getDb }))(req, res)
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(body).error).toBe('payment_headers_not_accepted')
    expect(getDb).not.toHaveBeenCalled()
  })
})
