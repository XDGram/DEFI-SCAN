// Signatures here use an ephemeral key created in memory by the test process and discarded with it.
// Nothing is sent to any network or service.
import { IncomingMessage } from 'node:http'
import { Socket } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { createSiweMessage } from 'viem/siwe'
import { loadConfig } from '../server/config.js'
import { safeErrorCode } from '../server/redact.js'
import { requestOrigin } from '../server/routes.js'
import { issueNonce, pgNonceStore, sessionUser, verifySiwe, type NonceStore } from '../server/session.js'
import { testDb } from './helpers.js'

const SECRET = 'x'.repeat(48)
const EXPECTED = { domain: 'app.example', origin: 'https://app.example', chainId: 11155111 }

function reqWithCookies(cookies: string[], headers: Record<string, string> = {}) {
  const r = new IncomingMessage(new Socket())
  r.headers = { ...headers, cookie: cookies.map((c) => c.split(';')[0]).join('; ') }
  return r
}

async function signed(overrides: { domain?: string; uri?: string; chainId?: number; nonce?: string } = {}) {
  const issued = issueNonce(SECRET)
  const account = privateKeyToAccount(generatePrivateKey())
  const message = createSiweMessage({
    address: account.address,
    domain: overrides.domain ?? 'app.example',
    uri: overrides.uri ?? 'https://app.example',
    chainId: overrides.chainId ?? 11155111,
    nonce: overrides.nonce ?? issued.nonce,
    version: '1',
    issuedAt: new Date(),
  })
  return { message, signature: await account.signMessage({ message }), cookie: issued.setCookie, nonce: issued.nonce, account }
}

async function store(): Promise<NonceStore> {
  return pgNonceStore(await testDb())
}

describe('SIWE verification', () => {
  it('accepts a valid message and issues an HttpOnly, Secure, SameSite=Strict session', async () => {
    const s = await signed()
    const out = await verifySiwe(SECRET, reqWithCookies([s.cookie]), s, EXPECTED, await store())
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.address).toBe(s.account.address.toLowerCase())
    expect(out.setCookies[0]).toMatch(/^dos_session=.+; Path=\/api; HttpOnly; Secure; SameSite=Strict; Max-Age=43200$/)
    expect(out.setCookies[1]).toMatch(/^dos_siwe_nonce=; .*Max-Age=0$/)
    expect(sessionUser(SECRET, reqWithCookies([out.setCookies[0]]))).toBe(s.account.address.toLowerCase())
  })

  it('accepts a URI on the same origin with a path', async () => {
    const s = await signed({ uri: 'https://app.example/app/discover' })
    expect((await verifySiwe(SECRET, reqWithCookies([s.cookie]), s, EXPECTED, await store())).ok).toBe(true)
  })

  it('rejects the wrong chain ID without consuming the nonce', async () => {
    const st = await store()
    const s = await signed({ chainId: 1 })
    expect(await verifySiwe(SECRET, reqWithCookies([s.cookie]), s, EXPECTED, st)).toEqual({ ok: false, error: 'chain_id_mismatch' })
    const again = await signed({ nonce: s.nonce })
    expect((await verifySiwe(SECRET, reqWithCookies([s.cookie]), again, EXPECTED, st)).ok).toBe(true)
  })

  it.each([
    ['another origin', 'https://evil.example'],
    ['http instead of https', 'http://app.example'],
    ['a different port', 'https://app.example:8443'],
    ['a lookalike host', 'https://app.example.evil.example'],
  ])('rejects a URI on %s', async (_n, uri) => {
    const s = await signed({ uri })
    expect(await verifySiwe(SECRET, reqWithCookies([s.cookie]), s, EXPECTED, await store())).toEqual({ ok: false, error: 'uri_mismatch' })
  })

  it('rejects a message for the wrong host', async () => {
    const s = await signed({ domain: 'evil.example', uri: 'https://evil.example' })
    expect(await verifySiwe(SECRET, reqWithCookies([s.cookie]), s, EXPECTED, await store())).toEqual({ ok: false, error: 'domain_mismatch' })
  })

  it('rejects a reused nonce, whether the same message is replayed or a new message reuses it', async () => {
    const st = await store()
    const s = await signed()
    expect((await verifySiwe(SECRET, reqWithCookies([s.cookie]), s, EXPECTED, st)).ok).toBe(true)
    expect(await verifySiwe(SECRET, reqWithCookies([s.cookie]), s, EXPECTED, st)).toEqual({ ok: false, error: 'nonce_used' })
    const other = await signed({ nonce: s.nonce })
    expect(await verifySiwe(SECRET, reqWithCookies([s.cookie]), other, EXPECTED, st)).toEqual({ ok: false, error: 'nonce_used' })
  })

  it('lets exactly one of many concurrent verifications of the same nonce succeed', async () => {
    const st = await store()
    const s = await signed()
    const results = await Promise.all(Array.from({ length: 12 }, () => verifySiwe(SECRET, reqWithCookies([s.cookie]), s, EXPECTED, st)))
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok && r.error === 'nonce_used')).toHaveLength(11)
  })

  it('fails closed when the nonce store is unavailable', async () => {
    const s = await signed()
    const broken: NonceStore = { consume: async () => { throw new Error('db down at secret-host:6543') } }
    expect(await verifySiwe(SECRET, reqWithCookies([s.cookie]), s, EXPECTED, broken)).toEqual({ ok: false, error: 'nonce_store_unavailable' })
  })

  it('does not consume the nonce when the signature is invalid', async () => {
    const st = await store()
    const s = await signed()
    const bad = await verifySiwe(SECRET, reqWithCookies([s.cookie]), { message: s.message, signature: '0x' + '1'.repeat(130) }, EXPECTED, st)
    expect(bad.ok).toBe(false)
    expect((await verifySiwe(SECRET, reqWithCookies([s.cookie]), s, EXPECTED, st)).ok).toBe(true)
  })

  it('rejects missing nonce cookies, tampered sessions and sessions under another secret', async () => {
    const st = await store()
    expect(await verifySiwe(SECRET, reqWithCookies([]), { message: 'x', signature: '0x' + '1'.repeat(130) }, EXPECTED, st)).toEqual({ ok: false, error: 'nonce_missing_or_expired' })
    const s = await signed()
    const out = await verifySiwe(SECRET, reqWithCookies([s.cookie]), s, EXPECTED, st)
    if (!out.ok) throw new Error('sign-in failed')
    const tampered = out.setCookies[0].replace(/dos_session=([^.]+)\./, (_m, p) => `dos_session=${p}A.`)
    expect(sessionUser(SECRET, reqWithCookies([tampered]))).toBeNull()
    expect(sessionUser('y'.repeat(48), reqWithCookies([out.setCookies[0]]))).toBeNull()
  })
})

describe('nonce store failure logging', () => {
  afterEach(() => vi.restoreAllMocks())
  const SECRETS = ['SuperSecretPw', 'aws-0-eu-west-1.pooler.supabase.com', 'postgresql://', 'at secretFrame', 'db.tqrv']

  async function failWith(thrown: unknown) {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = await signed()
    const out = await verifySiwe(SECRET, reqWithCookies([s.cookie]), s, EXPECTED, { consume: async () => { throw thrown } })
    const logged = warn.mock.calls.map((c) => c.map(String).join(' ')).join('\n')
    return { out, logged }
  }

  it('logs only the database error code and keeps the client response unchanged', async () => {
    const err = Object.assign(
      new Error('password authentication failed for postgresql://postgres.ref:SuperSecretPw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres (db.tqrv)'),
      { code: '28P01', stack: 'Error: boom\n    at secretFrame (/var/task/x.js:1:1)' },
    )
    const { out, logged } = await failWith(err)
    expect(out).toEqual({ ok: false, error: 'nonce_store_unavailable' })
    expect(logged).toContain('siwe_nonce_store_unavailable')
    expect(logged).toContain('"code":"28P01"')
    for (const secret of SECRETS) expect(logged).not.toContain(secret)
  })

  it.each([
    ['a TLS error code', Object.assign(new Error('self signed certificate in chain for aws-0-eu-west-1.pooler.supabase.com'), { code: 'SELF_SIGNED_CERT_IN_CHAIN' }), 'SELF_SIGNED_CERT_IN_CHAIN'],
    ['an unexpected TypeError without a code', new TypeError('cannot read postgresql://postgres.ref:SuperSecretPw@host'), 'unknown'],
    ['a thrown string', 'postgresql://postgres.ref:SuperSecretPw@aws-0-eu-west-1.pooler.supabase.com:6543', 'unknown'],
    ['a code field that is not a short code', Object.assign(new Error('x'), { code: 'postgresql://postgres.ref:SuperSecretPw@host' }), 'unknown'],
    ['null', null, 'unknown'],
  ])('fails closed and logs nothing sensitive for %s', async (_n, thrown, code) => {
    const { out, logged } = await failWith(thrown)
    expect(out).toEqual({ ok: false, error: 'nonce_store_unavailable' })
    expect(logged).toContain(`"code":"${code}"`)
    for (const secret of SECRETS) expect(logged).not.toContain(secret)
  })

  it('safeErrorCode accepts only short upper-case codes', () => {
    expect(safeErrorCode({ code: 'ECONNREFUSED' })).toBe('ECONNREFUSED')
    expect(safeErrorCode({ code: '57P01' })).toBe('57P01')
    expect(safeErrorCode({ code: 'econnrefused' })).toBe('unknown')
    expect(safeErrorCode({ code: 'A'.repeat(41) })).toBe('unknown')
    expect(safeErrorCode({ code: 42 })).toBe('unknown')
    expect(safeErrorCode(undefined)).toBe('unknown')
  })
})

describe('expected origin and chain configuration', () => {
  it('derives an https origin from the request host, allowing http only for localhost', () => {
    expect(requestOrigin(reqWithCookies([], { host: 'app.example' }))).toBe('https://app.example')
    expect(requestOrigin(reqWithCookies([], { host: 'app.example', 'x-forwarded-proto': 'http' }))).toBe('https://app.example')
    expect(requestOrigin(reqWithCookies([], { 'x-forwarded-host': 'preview.example', host: 'internal' }))).toBe('https://preview.example')
    expect(requestOrigin(reqWithCookies([], { host: 'localhost:3000', 'x-forwarded-proto': 'http' }))).toBe('http://localhost:3000')
  })

  it('defaults SIWE_CHAIN_ID to 11155111 and rejects invalid values', () => {
    expect(loadConfig({}).siweChainId).toBe(11155111)
    expect(loadConfig({ SIWE_CHAIN_ID: '1' }).siweChainId).toBe(1)
    expect(() => loadConfig({ SIWE_CHAIN_ID: 'sepolia' })).toThrow(/SIWE_CHAIN_ID/)
    expect(() => loadConfig({ SIWE_CHAIN_ID: '0' })).toThrow(/SIWE_CHAIN_ID/)
  })
})
