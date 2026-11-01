import { IncomingMessage } from 'node:http'
import { Socket } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { createSiweMessage } from 'viem/siwe'
import { loadConfig } from '../server/config.js'
import { clearMarketCache, marketChart, marketPools } from '../server/defillama.js'
import * as signer from '../server/payments/signer.js'
import { issueNonce, sessionUser, verifySiwe } from '../server/session.js'

const SECRET = 'x'.repeat(48)

function reqWithCookies(cookies: string[]) {
  const r = new IncomingMessage(new Socket())
  r.headers = { cookie: cookies.map((c) => c.split(';')[0]).join('; ') }
  return r
}

async function signIn(domain = 'app.example') {
  const { nonce, setCookie } = issueNonce(SECRET)
  const account = privateKeyToAccount(generatePrivateKey())
  const message = createSiweMessage({ address: account.address, chainId: 11155111, domain: 'app.example', nonce, uri: 'https://app.example', version: '1', issuedAt: new Date() })
  const signature = await account.signMessage({ message })
  return { out: await verifySiwe(SECRET, reqWithCookies([setCookie]), { message, signature }, domain), account }
}

describe('Sign-In with Ethereum sessions', () => {
  it('verifies a signed message and issues an HttpOnly, Secure, SameSite=Strict session', async () => {
    const { out, account } = await signIn()
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.address).toBe(account.address.toLowerCase())
    expect(out.setCookies[0]).toMatch(/HttpOnly; Secure; SameSite=Strict/)
    expect(sessionUser(SECRET, reqWithCookies([out.setCookies[0]]))).toBe(account.address.toLowerCase())
  })

  it('rejects a message for another domain', async () => {
    const { out } = await signIn('evil.example')
    expect(out).toEqual({ ok: false, error: 'message_rejected' })
  })

  it('rejects missing nonce cookies and tampered sessions', async () => {
    const r = await verifySiwe(SECRET, reqWithCookies([]), { message: 'x', signature: '0x' + '1'.repeat(130) }, 'app.example')
    expect(r).toEqual({ ok: false, error: 'nonce_missing_or_expired' })
    const { out } = await signIn()
    if (!out.ok) throw new Error('sign-in failed')
    const tampered = out.setCookies[0].replace(/dos_session=([^.]+)\./, (_m, p) => `dos_session=${p}A.`)
    expect(sessionUser(SECRET, reqWithCookies([tampered]))).toBeNull()
    expect(sessionUser('y'.repeat(48), reqWithCookies([out.setCookies[0]]))).toBeNull()
  })
})

describe('DefiLlama proxy', () => {
  afterEach(() => clearMarketCache())
  const pools = { data: [{ pool: 'abc-1', chain: 'Ethereum', project: 'aave-v3', symbol: 'USDC', tvlUsd: 1, apy: 2, predictions: { x: 1 }, extra: 'drop' }] }

  it('uses the legacy free endpoint until a key and base template are configured', () => {
    expect(loadConfig({}).defillama).toEqual({ yieldsBase: 'https://yields.llama.fi', usesKey: false })
    const c = loadConfig({ DEFILLAMA_API_KEY: 'K', DEFILLAMA_YIELDS_BASE_TEMPLATE: 'https://pro.invalid/{key}/yields/v1' })
    expect(c.defillama).toEqual({ yieldsBase: 'https://pro.invalid/K/yields/v1', usesKey: true })
  })

  it('returns only reviewed fields with public caching and the fetch time', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(pools)))
    const r = await marketPools(loadConfig({}), f as never)
    expect(r.status).toBe(200)
    expect(r.headers?.['Cache-Control']).toContain('s-maxage=300')
    const row = (r.body as any).data[0]
    expect(row.pool).toBe('abc-1')
    expect(row).not.toHaveProperty('extra')
    expect(row).not.toHaveProperty('predictions')
    expect(typeof (r.body as any).fetchedAt).toBe('number')
  })

  it('caches upstream calls', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(pools)))
    await marketPools(loadConfig({}), f as never)
    await marketPools(loadConfig({}), f as never)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('never leaks the API key on upstream failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const f = vi.fn(async () => {
      throw new Error('fetch failed for https://pro-api.llama.fi/SUPERSECRET/yields/v1/pools')
    })
    const cfg = loadConfig({ DEFILLAMA_API_KEY: 'SUPERSECRET', DEFILLAMA_YIELDS_BASE_TEMPLATE: 'https://pro-api.llama.fi/{key}/yields/v1' })
    const r = await marketPools(cfg, f as never)
    const logged = warn.mock.calls.map((c) => String(c[0])).join('\n')
    warn.mockRestore()
    expect(r.status).toBe(502)
    expect(JSON.stringify(r.body)).not.toContain('SUPERSECRET')
    expect(logged).not.toContain('SUPERSECRET')
  })

  it('validates chart pool ids before calling upstream', async () => {
    const f = vi.fn()
    expect((await marketChart(loadConfig({}), '../../etc', f as never)).status).toBe(400)
    expect(f).not.toHaveBeenCalled()
  })
})

describe('payment signer isolation', () => {
  it('exposes x402 payment signing only, and it is disabled in this phase', async () => {
    expect(Object.keys(signer).sort()).toEqual(['PaymentsNotEnabledError', 'signExactPayment'])
    await expect(signer.signExactPayment({ network: 'eip155:1', asset: '0x', payTo: '0x', value: 1n, validAfter: 0, validBefore: 1, nonce: '0x' })).rejects.toThrow(signer.PaymentsNotEnabledError)
  })

  it('payments are disabled unless explicitly enabled', () => {
    expect(loadConfig({}).paymentsEnabled).toBe(false)
    expect(loadConfig({ PAYMENTS_ENABLED: 'yes' }).paymentsEnabled).toBe(false)
  })
})
