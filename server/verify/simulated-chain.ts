import type { AuthorizationUsedEvent, ChainReader, TxReceipt } from './chain.js'

// Test double only. Holds hand-written blocks so the verifier can be exercised without any network access.
export class SimulatedChain implements ChainReader {
  auths: (AuthorizationUsedEvent & { asset: string; authorizer: string; nonce: string })[] = []
  receipts = new Map<string, TxReceipt>()
  canonical = new Map<bigint, string>()
  tags = { latest: 0n, safe: 0n, finalized: 0n }

  constructor(public network: string) {}

  async findAuthorizationUsed(asset: string, authorizer: string, nonce: string, fromBlock: bigint) {
    return this.auths
      .filter(
        (a) =>
          a.asset.toLowerCase() === asset.toLowerCase() &&
          a.authorizer.toLowerCase() === authorizer.toLowerCase() &&
          a.nonce.toLowerCase() === nonce.toLowerCase() &&
          a.blockNumber >= fromBlock &&
          this.canonical.get(a.blockNumber)?.toLowerCase() === a.blockHash.toLowerCase(),
      )
      .map(({ txHash, blockNumber, blockHash }) => ({ txHash, blockNumber, blockHash }))
  }

  async getReceipt(txHash: string) {
    return this.receipts.get(txHash.toLowerCase()) ?? null
  }

  async getTaggedBlockNumber(tag: 'latest' | 'safe' | 'finalized') {
    return this.tags[tag]
  }

  async getCanonicalBlockHash(n: bigint) {
    return this.canonical.get(n) ?? null
  }
}
