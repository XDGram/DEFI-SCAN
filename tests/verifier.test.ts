import { describe, expect, it } from 'vitest'
import { finalityPolicyFor } from '../server/verify/chain.js'
import { SimulatedChain } from '../server/verify/simulated-chain.js'
import { displayDecision, verifyPayment, type SignedPayment } from '../server/verify/verifier.js'
import type { TelegraphReceipt } from '../server/x402/receipt.js'
import { FAKE } from './helpers.js'

const TX = '0x' + '7'.repeat(64)
const OTHER_TX = '0x' + '8'.repeat(64)
const NONCE = '0x' + '5'.repeat(64)
const BLOCK = 100n
const HASH = '0x' + 'aa'.repeat(32)

const payment: SignedPayment = { network: FAKE.network, asset: FAKE.asset, payTo: FAKE.payTo, from: FAKE.agent, value: 10_000n, nonce: NONCE, validBefore: 1_000, intent: 'TEST_INTENT' }
const receipt = (o: Partial<TelegraphReceipt> = {}): TelegraphReceipt => ({ receiptHash: '0x' + '9'.repeat(64), rail: 'x402', payer: FAKE.agent, miner: '1', intent: 'TEST_INTENT', amountUusdc: 10_000n, epochId: 1, settlement: 'onchain', chain: FAKE.network, txHash: TX, timestamp: 1, ...o })

function chain(opts: { settled?: boolean; status?: 0 | 1; transferTo?: string; finalized?: bigint; safe?: bigint } = {}) {
  const c = new SimulatedChain(FAKE.network)
  c.canonical.set(BLOCK, HASH)
  c.tags = { latest: 200n, safe: opts.safe ?? 0n, finalized: opts.finalized ?? 0n }
  if (opts.settled !== false) {
    c.auths.push({ asset: FAKE.asset, authorizer: FAKE.agent, nonce: NONCE, txHash: TX, blockNumber: BLOCK, blockHash: HASH })
    c.receipts.set(TX, { status: opts.status ?? 1, blockNumber: BLOCK, blockHash: HASH, transfers: [{ token: FAKE.asset, from: FAKE.agent, to: opts.transferTo ?? FAKE.payTo, value: 10_000n }] })
  }
  return c
}

const delivered = { httpStatus: 200, receipt: receipt() }

describe('settlement classification (never claims facilitator verification)', () => {
  it('node-reconciled when the node’s claimed tx equals the chain’s AuthorizationUsed tx', async () => {
    const v = await verifyPayment(chain(), payment, delivered, 0n, 10)
    expect(v.settlement).toBe('node_reconciled')
    expect(v.facilitatorVerified).toBe(false)
    expect(v.finality).toBe('included')
  })

  it('suspected preemption: nonce used on-chain but node did not deliver (Attack I-B)', async () => {
    const v = await verifyPayment(chain(), payment, { httpStatus: 402, receipt: null }, 0n, 10)
    expect(v.settlement).toBe('suspected_preemption')
    expect(v.reasons).toContain('nonce_used_without_delivery')
  })

  it('suspected preemption: node claims a different tx than the chain shows', async () => {
    const v = await verifyPayment(chain(), payment, { httpStatus: 200, receipt: receipt({ txHash: OTHER_TX }) }, 0n, 10)
    expect(v.settlement).toBe('suspected_preemption')
    expect(v.reasons).toContain('claimed_tx_differs_from_chain')
  })

  it('pending before expiry, missing after expiry when delivered but the nonce is unused', async () => {
    expect((await verifyPayment(chain({ settled: false }), payment, delivered, 0n, 10)).settlement).toBe('settlement_pending')
    expect((await verifyPayment(chain({ settled: false }), payment, delivered, 0n, 5_000)).settlement).toBe('settlement_missing')
  })

  it('not settled when nothing was delivered and the nonce is unused', async () => {
    expect((await verifyPayment(chain({ settled: false }), payment, { httpStatus: 503, receipt: null }, 0n, 10)).settlement).toBe('not_settled')
  })

  it('mismatch when the transfer goes elsewhere, the tx failed, or the receipt disagrees', async () => {
    expect((await verifyPayment(chain({ transferTo: FAKE.other }), payment, delivered, 0n, 10)).settlement).toBe('mismatch')
    expect((await verifyPayment(chain({ status: 0 }), payment, delivered, 0n, 10)).settlement).toBe('mismatch')
    const v = await verifyPayment(chain(), payment, { httpStatus: 200, receipt: receipt({ amountUusdc: 20_000n }) }, 0n, 10)
    expect(v.settlement).toBe('mismatch')
    expect(v.reasons).toContain('receipt_amount')
  })

  it('refuses networks without a reviewed finality policy (no Base figures applied to Sepolia)', async () => {
    expect(finalityPolicyFor('eip155:84532')).toBeNull()
    const v = await verifyPayment(new SimulatedChain('eip155:84532'), { ...payment, network: 'eip155:84532' }, delivered, 0n, 10)
    expect(v.settlement).toBe('mismatch')
    expect(v.reasons).toContain('unsupported_or_mismatched_network')
  })
})

describe('finality and display (Attack I-A record accuracy)', () => {
  it('shows results at inclusion labelled "Awaiting finality"', async () => {
    const v = await verifyPayment(chain(), payment, delivered, 0n, 10)
    expect(displayDecision(v, false)).toEqual({ showResult: true, label: 'Awaiting finality', revokeVerified: false })
  })

  it('"safe" is still awaiting finality', async () => {
    const v = await verifyPayment(chain({ safe: 150n }), payment, delivered, 0n, 10)
    expect(v.finality).toBe('safe')
    expect(displayDecision(v, false).label).toBe('Awaiting finality')
  })

  it('marks payment final only once the finalized checkpoint passes the block', async () => {
    const v = await verifyPayment(chain({ finalized: 100n, safe: 150n }), payment, delivered, 0n, 10)
    expect(v.finality).toBe('finalized')
    expect(displayDecision(v, false).label).toBe('Payment final')
  })

  it('reorg: block hash no longer canonical revokes verified status for reconciliation', async () => {
    const c = chain({ finalized: 0n })
    const before = await verifyPayment(c, payment, delivered, 0n, 10)
    expect(displayDecision(before, false).showResult).toBe(true)
    c.canonical.set(BLOCK, '0x' + 'bb'.repeat(32))
    const after = await verifyPayment(c, payment, delivered, 0n, 10)
    expect(displayDecision(after, true)).toEqual({ showResult: false, label: null, revokeVerified: true })
  })

  it('suspected preemption and mismatches never display results', async () => {
    const v = await verifyPayment(chain(), payment, { httpStatus: 402, receipt: null }, 0n, 10)
    expect(displayDecision(v, false).showResult).toBe(false)
  })
})
