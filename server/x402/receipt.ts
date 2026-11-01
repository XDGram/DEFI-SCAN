import { decodeSingleBase64Json, HeaderError, type HeaderValue } from './headers.js'

// Field set documented in telegraph-docs using/x402-inference.md ("Your receipt"). Confirm against a live receipt before relying on it.
export interface TelegraphReceipt {
  receiptHash: string
  rail: string
  payer: string
  miner: string
  intent: string
  amountUusdc: bigint
  epochId: number
  settlement: string
  chain: string
  txHash: string | null
  timestamp: number
}

const HASH32 = /^0x[0-9a-fA-F]{64}$/
const ADDRESS = /^0x[0-9a-fA-F]{40}$/

export function parseReceipt(header: HeaderValue): TelegraphReceipt {
  const r = decodeSingleBase64Json(header)
  const bad = (f: string) => new HeaderError('invalid_shape', `receipt field ${f} is invalid`)
  if (typeof r.receipt_hash !== 'string' || !HASH32.test(r.receipt_hash)) throw bad('receipt_hash')
  if (typeof r.rail !== 'string') throw bad('rail')
  if (typeof r.payer !== 'string' || !ADDRESS.test(r.payer)) throw bad('payer')
  if (typeof r.miner !== 'string' && typeof r.miner !== 'number') throw bad('miner')
  if (typeof r.intent !== 'string') throw bad('intent')
  if (typeof r.amount_uusdc !== 'string' || !/^\d{1,30}$/.test(r.amount_uusdc)) throw bad('amount_uusdc')
  if (typeof r.epoch_id !== 'number' || !Number.isInteger(r.epoch_id)) throw bad('epoch_id')
  if (typeof r.settlement !== 'string') throw bad('settlement')
  if (typeof r.chain !== 'string') throw bad('chain')
  if (r.tx_hash !== undefined && r.tx_hash !== null && (typeof r.tx_hash !== 'string' || !HASH32.test(r.tx_hash))) throw bad('tx_hash')
  if (typeof r.timestamp !== 'number' || !Number.isInteger(r.timestamp)) throw bad('timestamp')
  return {
    receiptHash: r.receipt_hash.toLowerCase(),
    rail: r.rail,
    payer: r.payer,
    miner: String(r.miner),
    intent: r.intent,
    amountUusdc: BigInt(r.amount_uusdc),
    epochId: r.epoch_id,
    settlement: r.settlement,
    chain: r.chain,
    txHash: typeof r.tx_hash === 'string' ? r.tx_hash.toLowerCase() : null,
    timestamp: r.timestamp,
  }
}

export interface ReceiptExpectation {
  payer: string
  intent: string
  amountUusdc: bigint
  network: string
}

export function receiptMismatches(r: TelegraphReceipt, e: ReceiptExpectation): string[] {
  const m: string[] = []
  if (r.rail !== 'x402') m.push('rail')
  if (r.settlement !== 'onchain') m.push('settlement')
  if (r.payer.toLowerCase() !== e.payer.toLowerCase()) m.push('payer')
  if (r.intent !== e.intent) m.push('intent')
  if (r.amountUusdc !== e.amountUusdc) m.push('amount')
  if (r.chain !== e.network) m.push('chain')
  if (!r.txHash) m.push('tx_hash_missing')
  return m
}
