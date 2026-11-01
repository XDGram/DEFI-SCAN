import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadAllowlist, validateAllowlist, type ProviderAllowlist } from '../server/allowlist.js'
import { parseChallenge, selectAccept } from '../server/x402/challenge.js'
import { HeaderError } from '../server/x402/headers.js'
import { parseReceipt, receiptMismatches } from '../server/x402/receipt.js'
import { b64, FAKE } from './helpers.js'

const URL_ = 'https://node.invalid/engine/v1/ask'
const LIST: ProviderAllowlist = {
  version: 1,
  verifiedAt: '2026-01-01T00:00:00Z',
  verificationSource: 'synthetic test fixture',
  node: { baseUrl: 'https://node.invalid' },
  payment: { schemes: ['exact'], network: FAKE.network, asset: FAKE.asset, payTo: FAKE.payTo, maxTimeoutSeconds: 60 },
  intents: [{ topic: 'audits', intent: 'TEST_INTENT', requestSchemaVersion: 1, responseFormatVersion: 1, params: [], fields: [{ name: 'x', type: 'string' }], miners: [{ id: '1', maxPriceUusdc: '20000' }] }],
}
const accept = (o: object = {}) => ({ scheme: 'exact', network: FAKE.network, asset: FAKE.asset, amount: '10000', payTo: FAKE.payTo, maxTimeoutSeconds: 60, extra: {}, ...o })
const challenge = (o: object = {}, acc = [accept()]) => b64({ x402Version: 2, resource: { url: URL_ }, accepts: acc, ...o })
const CTX = { requestedUrl: URL_, confirmedQuoteUusdc: 10_000n, perRequestCapUusdc: 50_000n, minerMaxPriceUusdc: 20_000n }

describe('challenge parsing (Attack III D1 header handling)', () => {
  it('parses a single well-formed header', () => {
    const c = parseChallenge(challenge())
    expect(c.accepts[0].amount).toBe(10_000n)
  })

  it.each([
    ['missing', undefined, 'missing'],
    ['duplicate array', [challenge(), challenge()], 'duplicate'],
    ['comma-merged duplicate', `${challenge()},${challenge()}`, 'duplicate'],
    ['not base64', '%%%notbase64%%%', 'not_base64'],
    ['not json', Buffer.from('hello').toString('base64'), 'not_json'],
    ['oversize', 'A'.repeat(9000), 'too_large'],
    ['json array', b64([1, 2]), 'invalid_shape'],
  ])('refuses %s', (_n, value, code) => {
    try {
      parseChallenge(value as never)
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(HeaderError)
      expect((e as HeaderError).code).toBe(code)
    }
  })

  it('drops accept entries it cannot type-check rather than guessing', () => {
    const c = parseChallenge(challenge({}, [accept({ amount: 'lots' }), accept({ payTo: 'nope' }), accept()]))
    expect(c.accepts).toHaveLength(1)
  })
})

describe('selection before signing (resource binding, payTo, caps)', () => {
  it('accepts a matching entry', () => {
    expect(selectAccept(parseChallenge(challenge()), LIST, CTX).ok).toBe(true)
  })

  it.each([
    ['resource_mismatch', challenge({ resource: { url: 'https://node.invalid/other' } }), CTX],
    ['network_mismatch', challenge({}, [accept({ network: 'eip155:1' })]), CTX],
    ['asset_mismatch', challenge({}, [accept({ asset: FAKE.other })]), CTX],
    ['pay_to_changed', challenge({}, [accept({ payTo: FAKE.other })]), CTX],
    ['amount_over_quote', challenge({}, [accept({ amount: '10001' })]), CTX],
    ['amount_over_miner_cap', challenge({}, [accept({ amount: '20001' })]), { ...CTX, confirmedQuoteUusdc: 30_000n }],
    ['amount_over_request_cap', challenge({}, [accept({ amount: '60000' })]), { ...CTX, confirmedQuoteUusdc: 99_999n, minerMaxPriceUusdc: 99_999n }],
    ['timeout_too_long', challenge({}, [accept({ maxTimeoutSeconds: 600 })]), CTX],
    ['zero_amount', challenge({}, [accept({ amount: '0' })]), CTX],
    ['no_allowed_scheme', challenge({}, [accept({ scheme: 'upto' })]), CTX],
  ])('refuses %s', (code, header, ctx) => {
    const s = selectAccept(parseChallenge(header), LIST, ctx)
    expect(s.ok).toBe(false)
    if (!s.ok) expect(s.refusals).toContain(code)
  })
})

describe('receipt parsing and expectations', () => {
  const good = { receipt_hash: '0x' + '9'.repeat(64), rail: 'x402', payer: FAKE.agent, miner: '4664', intent: 'TEST_INTENT', amount_uusdc: '10000', epoch_id: 1, settlement: 'onchain', chain: FAKE.network, tx_hash: '0x' + '7'.repeat(64), timestamp: 1 }
  const exp = { payer: FAKE.agent, intent: 'TEST_INTENT', amountUusdc: 10_000n, network: FAKE.network }

  it('accepts a matching receipt', () => {
    expect(receiptMismatches(parseReceipt(b64(good)), exp)).toEqual([])
  })

  it('flags every mismatched field', () => {
    const r = parseReceipt(b64({ ...good, payer: FAKE.other, amount_uusdc: '20000', chain: 'eip155:1', intent: 'OTHER', rail: 'escrow', settlement: 'epoch', tx_hash: null }))
    expect(receiptMismatches(r, exp).sort()).toEqual(['amount', 'chain', 'intent', 'payer', 'rail', 'settlement', 'tx_hash_missing'])
  })

  it('refuses malformed receipts', () => {
    expect(() => parseReceipt(b64({ ...good, receipt_hash: 'nope' }))).toThrow(HeaderError)
    expect(() => parseReceipt([b64(good), b64(good)])).toThrow(HeaderError)
  })
})

describe('provider allowlist', () => {
  it('is not configured by default, which blocks all purchases', () => {
    expect(loadAllowlist({}).status).toBe('not_configured')
  })

  it('rejects the shipped example because it only contains placeholders', () => {
    const text = readFileSync(new URL('../config/provider-allowlist.example.json', import.meta.url), 'utf8')
    const s = loadAllowlist({ PROVIDER_ALLOWLIST_JSON: text })
    expect(s.status).toBe('invalid')
  })

  it('validates a complete synthetic list and rejects bad fields', () => {
    expect(validateAllowlist(LIST).status).toBe('ready')
    const bad = validateAllowlist({ ...LIST, node: { baseUrl: 'http://x/path' }, payment: { ...LIST.payment, payTo: '0x' + '0'.repeat(40), network: 'base' } })
    expect(bad.status).toBe('invalid')
    if (bad.status === 'invalid') expect(bad.problems.length).toBeGreaterThanOrEqual(3)
  })

  it('reports unreadable files and invalid JSON without throwing', () => {
    expect(loadAllowlist({ PROVIDER_ALLOWLIST_PATH: '/nonexistent/file.json' }).status).toBe('invalid')
    expect(loadAllowlist({ PROVIDER_ALLOWLIST_JSON: '{nope' }).status).toBe('invalid')
  })
})
