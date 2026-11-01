import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { isAddress, verifyMessage } from 'viem'
import { parseSiweMessage, validateSiweMessage } from 'viem/siwe'

const SESSION_COOKIE = 'dos_session'
const NONCE_COOKIE = 'dos_siwe_nonce'
const SESSION_TTL_S = 12 * 60 * 60
const NONCE_TTL_S = 10 * 60
const MAX_MESSAGE_AGE_MS = 10 * 60 * 1000

function sign(secret: string, payload: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function seal(secret: string, data: object): string {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url')
  return `${payload}.${sign(secret, payload)}`
}

function unseal<T>(secret: string, token: string | undefined): T | null {
  if (!token) return null
  const [payload, mac] = token.split('.')
  if (!payload || !mac) return null
  const expected = Buffer.from(sign(secret, payload))
  const got = Buffer.from(mac)
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as T & { exp: number }
    return data.exp > Math.floor(Date.now() / 1000) ? data : null
  } catch {
    return null
  }
}

export function readCookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

function cookie(name: string, value: string, maxAge: number) {
  return `${name}=${encodeURIComponent(value)}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`
}

export function issueNonce(secret: string): { nonce: string; setCookie: string } {
  const nonce = randomBytes(16).toString('hex')
  const token = seal(secret, { nonce, exp: Math.floor(Date.now() / 1000) + NONCE_TTL_S })
  return { nonce, setCookie: cookie(NONCE_COOKIE, token, NONCE_TTL_S) }
}

export type SiweOutcome = { ok: true; address: string; setCookies: string[] } | { ok: false; error: string }

// EOA signatures only: verified offline. Smart-contract wallets (ERC-1271) need an RPC and are not supported yet.
export async function verifySiwe(
  secret: string,
  req: IncomingMessage,
  body: { message?: unknown; signature?: unknown },
  expectedDomain: string,
  now = new Date(),
): Promise<SiweOutcome> {
  if (typeof body.message !== 'string' || body.message.length > 2000) return { ok: false, error: 'invalid_message' }
  if (typeof body.signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(body.signature)) return { ok: false, error: 'invalid_signature' }
  const stored = unseal<{ nonce: string }>(secret, readCookies(req)[NONCE_COOKIE])
  if (!stored) return { ok: false, error: 'nonce_missing_or_expired' }
  const msg = parseSiweMessage(body.message)
  if (!msg.address || !isAddress(msg.address)) return { ok: false, error: 'invalid_message' }
  if (!validateSiweMessage({ message: msg, domain: expectedDomain, nonce: stored.nonce, time: now })) return { ok: false, error: 'message_rejected' }
  if (msg.version !== '1' || !msg.issuedAt || now.getTime() - msg.issuedAt.getTime() > MAX_MESSAGE_AGE_MS) return { ok: false, error: 'message_rejected' }
  const valid = await verifyMessage({ address: msg.address, message: body.message, signature: body.signature as `0x${string}` }).catch(() => false)
  if (!valid) return { ok: false, error: 'signature_mismatch' }
  const address = msg.address.toLowerCase()
  const session = seal(secret, { address, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_S })
  return { ok: true, address, setCookies: [cookie(SESSION_COOKIE, session, SESSION_TTL_S), cookie(NONCE_COOKIE, '', 0)] }
}

export function sessionUser(secret: string | null, req: IncomingMessage): string | null {
  if (!secret) return null
  return unseal<{ address: string }>(secret, readCookies(req)[SESSION_COOKIE])?.address ?? null
}

export function clearSessionCookie() {
  return cookie(SESSION_COOKIE, '', 0)
}
