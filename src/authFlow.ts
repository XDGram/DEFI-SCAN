// SIWE sign-in flow for injected browser wallets. No DOM globals: everything is passed in, so it can be tested.
// The message is built with viem's SIWE helper (the same library the server parses it with), from the exact
// values the server returns with the nonce, and those values are checked against this page before signing.
import { getAddress, isAddress, stringToHex } from 'viem'
import { createSiweMessage } from 'viem/siwe'

export interface Eip1193Like {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
}

export interface AuthDeps {
  fetch: typeof fetch
  ethereum: Eip1193Like | undefined
  location: { host: string; origin: string }
  now?: () => Date
}

export type AuthErrorCode =
  | 'no_wallet'
  | 'wallet_not_connected'
  | 'wallet_rejected'
  | 'wrong_network'
  | 'site_mismatch'
  | 'sign_in_unavailable'
  | 'expired'
  | 'signature_invalid'
  | 'failed'

export class AuthError extends Error {
  constructor(public code: AuthErrorCode) {
    super(code)
  }
}

export const AUTH_ERROR_TEXT: Record<AuthErrorCode, string> = {
  no_wallet: 'No browser wallet found. Use a desktop browser with a wallet extension, or your wallet app’s built-in browser.',
  wallet_not_connected: 'Connect your wallet first.',
  wallet_rejected: 'The request was rejected in your wallet. Nothing was signed.',
  wrong_network: 'Switch your wallet to Sepolia to sign in.',
  site_mismatch: 'The sign-in details didn’t match this site. Reload the page and try again.',
  sign_in_unavailable: 'Sign-in is temporarily unavailable. Please try again later.',
  expired: 'That sign-in request expired. Please try again.',
  signature_invalid: 'The signature could not be verified. Please try again.',
  failed: 'Sign-in failed. Please try again.',
}

export interface SiweParams {
  nonce: string
  domain: string
  uri: string
  chainId: number
  version: '1'
}

export const SIGN_IN_STATEMENT = 'Sign in to DeFi Opportunity Scout. This does not send a transaction or cost any fees.'

// Refuses anything that does not describe this exact site, so the wallet is never asked to sign for another origin.
export function validateParams(raw: unknown, location: { host: string; origin: string }): SiweParams {
  const p = raw as Partial<SiweParams> | null
  const ok =
    !!p &&
    typeof p.nonce === 'string' &&
    /^[0-9a-f]{32}$/.test(p.nonce) &&
    p.domain === location.host &&
    p.uri === location.origin &&
    Number.isInteger(p.chainId) &&
    (p.chainId as number) > 0 &&
    p.version === '1'
  if (!ok) throw new AuthError('site_mismatch')
  return p as SiweParams
}

export function buildMessage(p: SiweParams, address: string, issuedAt: Date): string {
  return createSiweMessage({
    domain: p.domain,
    address: getAddress(address),
    statement: SIGN_IN_STATEMENT,
    uri: p.uri,
    version: p.version,
    chainId: p.chainId,
    nonce: p.nonce,
    issuedAt,
  })
}

const isRejection = (e: unknown) => (e as { code?: unknown } | null)?.code === 4001

const VERIFY_ERRORS: Record<string, AuthErrorCode> = {
  nonce_missing_or_expired: 'expired',
  nonce_used: 'expired',
  message_rejected: 'expired',
  domain_mismatch: 'site_mismatch',
  uri_mismatch: 'site_mismatch',
  chain_id_mismatch: 'site_mismatch',
  signature_mismatch: 'signature_invalid',
  invalid_signature: 'signature_invalid',
  invalid_message: 'signature_invalid',
  nonce_store_unavailable: 'sign_in_unavailable',
  sessions_not_configured: 'sign_in_unavailable',
}

async function errorCodeOf(res: Response): Promise<string> {
  try {
    const b = (await res.json()) as { error?: unknown }
    return typeof b.error === 'string' ? b.error : ''
  } catch {
    return ''
  }
}

async function ensureChain(eth: Eip1193Like, chainId: number) {
  const current = parseInt(String(await eth.request({ method: 'eth_chainId' })), 16)
  if (current === chainId) return
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${chainId.toString(16)}` }] })
  } catch {
    throw new AuthError('wrong_network')
  }
}

// Returns the address the server signed in. Throws AuthError with a safe code; never logs or returns the signature.
export async function signIn(deps: AuthDeps, address: string | null): Promise<string> {
  const eth = deps.ethereum
  if (!eth) throw new AuthError('no_wallet')
  if (!address || !isAddress(address)) throw new AuthError('wallet_not_connected')
  const accounts = ((await eth.request({ method: 'eth_accounts' }).catch(() => [])) as string[]).map((a) => a.toLowerCase())
  if (!accounts.includes(address.toLowerCase())) throw new AuthError('wallet_not_connected')

  let nonceRes: Response
  try {
    nonceRes = await deps.fetch('/api/auth/nonce', { method: 'GET', credentials: 'same-origin' })
  } catch {
    throw new AuthError('sign_in_unavailable')
  }
  if (nonceRes.status === 503) throw new AuthError('sign_in_unavailable')
  if (!nonceRes.ok) throw new AuthError('failed')
  const params = validateParams(await nonceRes.json().catch(() => null), deps.location)

  await ensureChain(eth, params.chainId)

  const message = buildMessage(params, address, (deps.now ?? (() => new Date()))())
  let signature: unknown
  try {
    signature = await eth.request({ method: 'personal_sign', params: [stringToHex(message), address] })
  } catch (e) {
    throw new AuthError(isRejection(e) ? 'wallet_rejected' : 'failed')
  }
  if (typeof signature !== 'string') throw new AuthError('failed')

  let verifyRes: Response
  try {
    verifyRes = await deps.fetch('/api/auth/verify', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, signature }),
    })
  } catch {
    throw new AuthError('sign_in_unavailable')
  }
  if (!verifyRes.ok) throw new AuthError(VERIFY_ERRORS[await errorCodeOf(verifyRes)] ?? 'failed')
  const body = (await verifyRes.json().catch(() => null)) as { address?: unknown } | null
  if (!body || typeof body.address !== 'string') throw new AuthError('failed')
  return body.address
}

export type SessionCheck = { status: 'signed_in'; address: string } | { status: 'signed_out' } | { status: 'unavailable' }

// The server session is the only source of truth for being signed in.
export async function checkSession(deps: Pick<AuthDeps, 'fetch'>): Promise<SessionCheck> {
  try {
    const r = await deps.fetch('/api/auth/me', { method: 'GET', credentials: 'same-origin' })
    if (r.status === 401) return { status: 'signed_out' }
    if (!r.ok) return { status: 'unavailable' }
    const b = (await r.json()) as { address?: unknown }
    return typeof b.address === 'string' ? { status: 'signed_in', address: b.address } : { status: 'unavailable' }
  } catch {
    return { status: 'unavailable' }
  }
}

export async function signOut(deps: Pick<AuthDeps, 'fetch'>): Promise<void> {
  const r = await deps.fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
  if (!r.ok) throw new AuthError('failed')
}
