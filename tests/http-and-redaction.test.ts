import { describe, expect, it, vi } from 'vitest'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { route } from '../server/http.js'
import { log, redact, redactHeaders, redactString, REDACTED } from '../server/redact.js'

function call(handler: ReturnType<typeof route>, opts: { method?: string; headers?: Record<string, string> } = {}) {
  const req = new IncomingMessage(new Socket())
  req.method = opts.method ?? 'GET'
  req.url = '/api/x'
  req.headers = opts.headers ?? {}
  const res = new ServerResponse(req)
  let body = ''
  res.end = ((chunk?: string) => {
    body = chunk ?? ''
    return res
  }) as never
  return handler(req, res).then(() => ({ status: res.statusCode, headers: res.getHeaders(), body: body ? JSON.parse(body) : undefined }))
}

const PAYMENT_HEADER = 'eyJ4NDAyVmVyc2lvbiI6Miwic2lnbmF0dXJlIjoiMHhkZWFkYmVlZmRlYWRiZWVmZGVhZGJlZWZkZWFkYmVlZmRlYWRiZWVmZGVhZGJlZWZkZWFkYmVlZiJ9'

describe('paid-route HTTP hygiene (Attack III)', () => {
  it('sets no-store, private and CDN no-store on private routes, including errors', async () => {
    const ok = await call(route(['GET'], async () => ({ status: 200, body: { secret: 'r' } })))
    const boom = await call(route(['GET'], async () => { throw new Error('x') }))
    for (const r of [ok, boom]) {
      expect(r.headers['cache-control']).toBe('no-store, private')
      expect(r.headers['cdn-cache-control']).toBe('no-store')
      expect(r.headers['vercel-cdn-cache-control']).toBe('no-store')
      expect(r.headers['vary']).toBe('Cookie, Authorization')
    }
    expect(boom.status).toBe(500)
    expect(boom.body).toEqual({ error: 'internal_error' })
  })

  it('refuses any inbound payment header before the handler runs', async () => {
    const handler = vi.fn(async () => ({ status: 200 }))
    for (const h of ['payment-signature', 'x-payment', 'payment-required', 'x-telegraph-receipt']) {
      const r = await call(route(['GET'], handler), { headers: { [h]: PAYMENT_HEADER } })
      expect(r.status).toBe(400)
      expect(r.body.error).toBe('payment_headers_not_accepted')
    }
    expect(handler).not.toHaveBeenCalled()
  })

  it('rejects wrong methods with 405 and keeps private caching headers', async () => {
    const r = await call(route(['POST'], async () => ({ status: 200 })), { method: 'GET' })
    expect(r.status).toBe(405)
    expect(r.headers['cache-control']).toBe('no-store, private')
  })

  it('public routes do not get the private headers', async () => {
    const r = await call(route(['GET'], async () => ({ status: 200, headers: { 'Cache-Control': 'public, s-maxage=300' }, body: {} }), { privateRoute: false }))
    expect(r.headers['cache-control']).toBe('public, s-maxage=300')
  })
})

describe('redaction (Attack I-B exposure via logs)', () => {
  it('redacts payment headers, cookies and keys', () => {
    const h = redactHeaders({ 'PAYMENT-SIGNATURE': PAYMENT_HEADER, 'X-Payment': PAYMENT_HEADER, cookie: 'dos_session=abc', 'content-type': 'application/json' })
    expect(h['PAYMENT-SIGNATURE']).toBe(REDACTED)
    expect(h['X-Payment']).toBe(REDACTED)
    expect(h.cookie).toBe(REDACTED)
    expect(h['content-type']).toBe('application/json')
  })

  it('redacts private keys, long base64 blobs and DefiLlama keys in URLs inside strings', () => {
    const s = redactString(`key 0x${'ab'.repeat(32)} hdr ${PAYMENT_HEADER} url https://pro-api.llama.fi/SECRETKEY123/yields/v1/pools`)
    expect(s).not.toContain('ab'.repeat(32))
    expect(s).not.toContain(PAYMENT_HEADER)
    expect(s).not.toContain('SECRETKEY123')
  })

  it('redacts nested sensitive keys and the logger never prints raw secrets', () => {
    expect(redact({ a: { signature: 'x', privateKey: 'y', ok: 1 } })).toEqual({ a: { signature: REDACTED, privateKey: REDACTED, ok: 1 } })
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    log.info('evt', { headers: { 'payment-signature': PAYMENT_HEADER }, note: PAYMENT_HEADER })
    const line = spy.mock.calls[0][0] as string
    spy.mockRestore()
    expect(line).not.toContain(PAYMENT_HEADER)
  })
})
