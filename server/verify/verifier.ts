import type { TelegraphReceipt } from '../x402/receipt.js'
import { receiptMismatches } from '../x402/receipt.js'
import { finalityPolicyFor, type ChainReader } from './chain.js'

export interface SignedPayment {
  network: string
  asset: string
  payTo: string
  from: string
  value: bigint
  nonce: string
  validBefore: number
  intent: string
}

export interface NodeOutcome {
  httpStatus: number | null
  receipt: TelegraphReceipt | null
}

export type Settlement =
  | 'not_settled'
  | 'settlement_pending'
  | 'node_reconciled'
  | 'suspected_preemption'
  | 'settlement_missing'
  | 'mismatch'

export type Finality = 'none' | 'included' | 'safe' | 'finalized' | 'reorged'

export interface Verification {
  settlement: Settlement
  finality: Finality
  txHash: string | null
  blockNumber: bigint | null
  blockHash: string | null
  // Never true in this design: matching the node's claimed tx to the chain does not prove who settled it.
  facilitatorVerified: false
  reasons: string[]
}

const lc = (s: string) => s.toLowerCase()

export async function verifyPayment(
  chain: ChainReader,
  p: SignedPayment,
  node: NodeOutcome,
  fromBlock: bigint,
  nowSeconds: number,
): Promise<Verification> {
  const base = { facilitatorVerified: false as const, txHash: null, blockNumber: null, blockHash: null }
  if (chain.network !== p.network || !finalityPolicyFor(p.network)) {
    return { ...base, settlement: 'mismatch', finality: 'none', reasons: ['unsupported_or_mismatched_network'] }
  }

  const events = await chain.findAuthorizationUsed(p.asset, p.from, p.nonce, fromBlock)
  if (events.length > 1) return { ...base, settlement: 'mismatch', finality: 'none', reasons: ['multiple_authorization_events'] }

  if (events.length === 0) {
    if (node.httpStatus === 200) {
      const expired = nowSeconds > p.validBefore
      return { ...base, settlement: expired ? 'settlement_missing' : 'settlement_pending', finality: 'none', reasons: [expired ? 'delivered_but_nonce_unused_after_expiry' : 'awaiting_settlement'] }
    }
    return { ...base, settlement: 'not_settled', finality: 'none', reasons: ['nonce_unused'] }
  }

  const ev = events[0]
  const rc = await chain.getReceipt(ev.txHash)
  if (!rc) return { ...base, settlement: 'settlement_pending', finality: 'none', txHash: lc(ev.txHash), reasons: ['receipt_unavailable'] }

  const located = { txHash: lc(ev.txHash), blockNumber: rc.blockNumber, blockHash: rc.blockHash }
  if (rc.status !== 1) return { ...base, ...located, settlement: 'mismatch', finality: 'none', reasons: ['settlement_tx_failed'] }

  const transferOk = rc.transfers.some(
    (t) => lc(t.token) === lc(p.asset) && lc(t.from) === lc(p.from) && lc(t.to) === lc(p.payTo) && t.value === p.value,
  )
  if (!transferOk) return { ...base, ...located, settlement: 'mismatch', finality: 'none', reasons: ['matching_transfer_not_found'] }

  const finality = await finalityOf(chain, rc.blockNumber, rc.blockHash)
  const reasons: string[] = []
  let settlement: Settlement
  const claimed = node.receipt?.txHash ? lc(node.receipt.txHash) : null
  if (node.httpStatus === 200 && node.receipt && claimed === located.txHash) {
    const mism = receiptMismatches(node.receipt, { payer: p.from, intent: p.intent, amountUusdc: p.value, network: p.network })
    if (mism.length) {
      settlement = 'mismatch'
      reasons.push(...mism.map((m) => `receipt_${m}`))
    } else settlement = 'node_reconciled'
  } else {
    // The nonce was consumed on-chain but the node did not deliver, or claims a different transaction.
    settlement = 'suspected_preemption'
    reasons.push(node.httpStatus !== 200 ? 'nonce_used_without_delivery' : claimed ? 'claimed_tx_differs_from_chain' : 'no_claimed_tx')
  }
  return { ...base, ...located, settlement, finality, reasons }
}

async function finalityOf(chain: ChainReader, blockNumber: bigint, blockHash: string): Promise<Finality> {
  const canonical = await chain.getCanonicalBlockHash(blockNumber)
  if (!canonical || lc(canonical) !== lc(blockHash)) return 'reorged'
  if ((await chain.getTaggedBlockNumber('finalized')) >= blockNumber) return 'finalized'
  if ((await chain.getTaggedBlockNumber('safe')) >= blockNumber) return 'safe'
  return 'included'
}

export interface DisplayDecision {
  showResult: boolean
  label: 'Awaiting finality' | 'Payment final' | null
  revokeVerified: boolean
}

// Results may show from inclusion, labelled "Awaiting finality"; only a passed finality check marks the payment final.
// A reorg (or a later check that no longer finds the settlement) revokes any verified status for reconciliation.
export function displayDecision(v: Verification, previouslyVerified: boolean): DisplayDecision {
  const lostSettlement = v.finality === 'reorged' || (previouslyVerified && v.settlement !== 'node_reconciled')
  if (lostSettlement) return { showResult: false, label: null, revokeVerified: true }
  if (v.settlement !== 'node_reconciled') return { showResult: false, label: null, revokeVerified: false }
  if (v.finality === 'finalized') return { showResult: true, label: 'Payment final', revokeVerified: false }
  if (v.finality === 'included' || v.finality === 'safe') return { showResult: true, label: 'Awaiting finality', revokeVerified: false }
  return { showResult: false, label: null, revokeVerified: false }
}
