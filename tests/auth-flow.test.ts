// End-to-end tests of the frontend sign-in flow against the real server-side SIWE code.
// The "wallet" is an ephemeral in-memory key created by the test process and discarded with it;
// the "server" calls the same functions the API routes use. No network or external service is touched.
import { IncomingMessage } from 'node:http'
import { Socket } from 'node:net'
import { describe, expect, it, vi } from 'vitest'
import { hexToString, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { parseSiweMessage } from 'viem/siwe'
import { AuthError, SIGN_IN_STATEMENT, buildMessage, checkSession, signIn, signOut, validateParams, type Eip1193Like } from '../src/authFlow.js'
import { loadConfig } from '../server/config.js'
import { siweExpectation } from '../server/routes.js'
import { clearSessionCookie, issueNonce, pgNonceStore, sessionUser, verifySiwe, type NonceStore } from '../server/session.js'
import { testDb } from './helpers.js'

const SECRET = 'z'.repeat(48)
const HOST = 'preview.example'
const LOCATION = { host: HOST, origin: `https://${HOST}` }
const SEPOLIA = 11155111

function serverRequest(cookies: Map<string, string>) {
  const r = new IncomingMessage(new Socket())
  r.headers = { host: HOST, cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') }
  return r
}

// A minimal stand-in for the four API routes, using the same server functions they call.
async function fakeServer(opts: { nonces?: NonceStore; nonceOverride?: Record<string, unknown>; nonceStatus?: number } = {}) {
  const cookies = new Map<string, string>()
  const nonces = opts.nonces ?? pgNonceStore(await testDb())
  const cfg = loadConfig({ SESSION_SECRET: SECRET })
  const calls: string[] = []
  const store = (setCookies: string | string[]) => {
    for (const c of ([] as string[]).concat(setCookies)) {
      const [pair] = c.split(';')
      const i = pair.indexOf('=')
      const name = pair.slice(0, i)
      const value = decodeURIComponent(pair.slice(i + 1))
      if (/Max-Age=0/.test(c) || !value) cookies.delete(name)
      else cookies.set(name, value)
    }
  }
  const json = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url)
    calls.push(path)
    const req = serverRequest(cookies)
    if (path === '/api/auth/nonce') {
      if (opts.nonceStatus) return json(opts.nonceStatus, { error: 'sessions_not_configured' })
      const { nonce, setCookie } = issueNonce(SECRET)
      store(setCookie)
      const e = siweExpectation(req, cfg)
      return json(200, { nonce, domain: e.domain, uri: e.origin, chainId: e.chainId, version: '1', ...opts.nonceOverride })
    }
    if (path === '/api/auth/verify') {
      const out = await verifySiwe(SECRET, req, JSON.parse(String(init?.body)), siweExpectation(req, cfg), nonces)
      if (!out.ok) return json(out.error === 'nonce_store_unavailable' ? 503 : 401, { error: out.error })
      store(out.setCookies)
      return json(200, { address: out.address })
    }
    if (path === '/api/auth/me') {
      const user = sessionUser(SECRET, req)
      return user ? json(200, { address: user }) : json(401, { error: 'sign_in_required' })
    }
    if (path === '/api/auth/logout') {
      store(clearSessionCookie())
      return json(204)
    }
    return json(404, { error: 'not_found' })
  })
  return { fetch: fetchImpl as unknown as typeof fetch, fetchMock: fetchImpl, cookies, calls }
}

function fakeWallet(opts: { chainId?: number; reject?: 'sign' | 'switch'; accounts?: 'none' } = {}) {
  const account = privateKeyToAccount(generatePrivateKey())
  let chainId = opts.chainId ?? SEPOLIA
  const signed: string[] = []
  const eth: Eip1193Like = {
    async request({ method, params }) {
      if (method === 'eth_accounts') return opts.accounts === 'none' ? [] : [account.address.toLowerCase()]
      if (method === 'eth_chainId') return `0x${chainId.toString(16)}`
      if (method === 'wallet_switchEthereumChain') {
        if (opts.reject === 'switch') throw Object.assign(new Error('User rejected'), { code: 4001 })
        chainId = parseInt((params?.[0] as { chainId: string }).chainId, 16)
        return null
      }
      if (method === 'personal_sign') {
        if (opts.reject === 'sign') throw Object.assign(new Error('User rejected the request.'), { code: 4001 })
        const message = hexToString(params?.[0] as Hex)
        signed.push(message)
        return account.signMessage({ message })
      }
      throw new Error(`unexpected method ${method}`)
    },
  }
  return { eth, account, signed, chainId: () => chainId }
}

async function run(server: Awaited<ReturnType<typeof fakeServer>>, wallet: ReturnType<typeof fakeWallet> | null, address?: string | null) {
  return signIn(
    { fetch: server.fetch, ethereum: wallet?.eth, location: LOCATION },
    address === undefined ? (wallet ? wallet.account.address.toLowerCase() : null) : address,
  )
}

async function codeOf(p: Promise<unknown>) {
  try {
    await p
    return 'no_error'
  } catch (e) {
    return e instanceof AuthError ? e.code : 'not_auth_error'
  }
}

describe('frontend SIWE sign-in against the real server verification', () => {
  it('signs in successfully and the server session is the source of truth', async () => {
    const server = await fakeServer()
    const wallet = fakeWallet()
    expect(await checkSession({ fetch: server.fetch })).toEqual({ status: 'signed_out' })
    const address = await run(server, wallet)
    expect(address).toBe(wallet.account.address.toLowerCase())
    expect(server.cookies.has('dos_session')).toBe(true)
    expect(server.cookies.has('dos_siwe_nonce')).toBe(false)
    expect(await checkSession({ fetch: server.fetch })).toEqual({ status: 'signed_in', address })
  })

  it('signs exactly the message the server expects: domain, URI, address, chain, nonce, issued-at', async () => {
    const server = await fakeServer()
    const wallet = fakeWallet()
    const before = Date.now()
    await run(server, wallet)
    const msg = parseSiweMessage(wallet.signed[0])
    expect(msg.domain).toBe(HOST)
    expect(msg.uri).toBe(`https://${HOST}`)
    expect(msg.address).toBe(wallet.account.address)
    expect(msg.chainId).toBe(SEPOLIA)
    expect(msg.version).toBe('1')
    expect(msg.statement).toBe(SIGN_IN_STATEMENT)
    expect(msg.nonce).toMatch(/^[0-9a-f]{32}$/)
    expect(msg.issuedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000)
  })

  it('a rejected signature leaves the user signed out and never calls verify', async () => {
    const server = await fakeServer()
    expect(await codeOf(run(server, fakeWallet({ reject: 'sign' })))).toBe('wallet_rejected')
    expect(server.calls).not.toContain('/api/auth/verify')
    expect(server.cookies.has('dos_session')).toBe(false)
  })

  it('an expired or missing nonce cookie is reported as expired', async () => {
    const server = await fakeServer()
    const wallet = fakeWallet()
    const realFetch = server.fetch
    const dropNonce = (async (url: string, init?: RequestInit) => {
      if (String(url) === '/api/auth/verify') server.cookies.delete('dos_siwe_nonce')
      return realFetch(url, init)
    }) as unknown as typeof fetch
    const code = await codeOf(signIn({ fetch: dropNonce, ethereum: wallet.eth, location: LOCATION }, wallet.account.address))
    expect(code).toBe('expired')
    expect(server.cookies.has('dos_session')).toBe(false)
  })

  it('a reused nonce is rejected by the server and reported as expired', async () => {
    const server = await fakeServer()
    const wallet = fakeWallet()
    await run(server, wallet)
    const replayed = await server.fetch('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ message: wallet.signed[0], signature: await wallet.account.signMessage({ message: wallet.signed[0] }) }),
    })
    expect(replayed.status).toBe(401)
  })

  it('refuses to sign when the server describes another site (invalid nonce response)', async () => {
    for (const override of [{ domain: 'evil.example' }, { uri: 'https://evil.example' }, { nonce: 'not-a-nonce' }, { version: '2' }]) {
      const server = await fakeServer({ nonceOverride: override, nonces: { consume: async () => true } })
      const wallet = fakeWallet()
      expect(await codeOf(run(server, wallet))).toBe('site_mismatch')
      expect(wallet.signed).toHaveLength(0)
    }
  })

  it('handles a missing or disconnected wallet without contacting the server', async () => {
    const server = await fakeServer()
    expect(await codeOf(run(server, null))).toBe('no_wallet')
    expect(await codeOf(run(server, fakeWallet(), null))).toBe('wallet_not_connected')
    expect(await codeOf(run(server, fakeWallet({ accounts: 'none' })))).toBe('wallet_not_connected')
    expect(server.calls).toHaveLength(0)
  })

  it('switches the wallet to Sepolia, and reports a refused switch', async () => {
    const server = await fakeServer()
    const ok = fakeWallet({ chainId: 1 })
    await run(server, ok)
    expect(ok.chainId()).toBe(SEPOLIA)
    const refused = fakeWallet({ chainId: 1, reject: 'switch' })
    expect(await codeOf(run(await fakeServer(), refused))).toBe('wrong_network')
    expect(refused.signed).toHaveLength(0)
  })

  it('reports sign-in as unavailable when sessions or the nonce store are down', async () => {
    expect(await codeOf(run(await fakeServer({ nonceStatus: 503 }), fakeWallet()))).toBe('sign_in_unavailable')
    const down: NonceStore = { consume: async () => { throw Object.assign(new Error('x'), { code: 'ECONNREFUSED' }) } }
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await codeOf(run(await fakeServer({ nonces: down }), fakeWallet()))).toBe('sign_in_unavailable')
    vi.restoreAllMocks()
  })

  it('logout clears the server session', async () => {
    const server = await fakeServer()
    await run(server, fakeWallet())
    expect((await checkSession({ fetch: server.fetch })).status).toBe('signed_in')
    await signOut({ fetch: server.fetch })
    expect(server.cookies.has('dos_session')).toBe(false)
    expect(await checkSession({ fetch: server.fetch })).toEqual({ status: 'signed_out' })
  })

  it('treats server errors and network failures as unavailable, never as signed in', async () => {
    const failing = (async () => { throw new TypeError('network') }) as unknown as typeof fetch
    expect(await checkSession({ fetch: failing })).toEqual({ status: 'unavailable' })
    const err503 = (async () => new Response('{}', { status: 503 })) as unknown as typeof fetch
    expect(await checkSession({ fetch: err503 })).toEqual({ status: 'unavailable' })
  })

  it('validateParams and buildMessage produce a message the server parser reads back identically', () => {
    const p = validateParams({ nonce: 'a'.repeat(32), domain: HOST, uri: `https://${HOST}`, chainId: SEPOLIA, version: '1' }, LOCATION)
    const addr = privateKeyToAccount(generatePrivateKey()).address
    const m = parseSiweMessage(buildMessage(p, addr.toLowerCase(), new Date('2026-11-01T00:00:00Z')))
    expect(m).toMatchObject({ domain: HOST, address: addr, uri: `https://${HOST}`, chainId: SEPOLIA, nonce: 'a'.repeat(32), version: '1' })
  })
})
