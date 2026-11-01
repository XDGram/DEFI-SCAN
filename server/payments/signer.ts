// The only module allowed to touch AGENT_PRIVATE_KEY. It exposes x402 payment signing and nothing else:
// no generic transaction sending, so no investment, transfer or approval transactions are possible.
//
// Phase 4: signing is not enabled. The live x402 signer is added only after live verification and approval.

export interface ExactAuthorization {
  network: string
  asset: string
  payTo: string
  value: bigint
  validAfter: number
  validBefore: number
  nonce: string
}

export class PaymentsNotEnabledError extends Error {
  constructor() {
    super('x402 signing is not enabled in this phase')
  }
}

export async function signExactPayment(_auth: ExactAuthorization): Promise<never> {
  throw new PaymentsNotEnabledError()
}
