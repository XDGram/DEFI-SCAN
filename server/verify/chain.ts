export interface AuthorizationUsedEvent {
  txHash: string
  blockNumber: bigint
  blockHash: string
}

export interface TransferLog {
  token: string
  from: string
  to: string
  value: bigint
}

export interface TxReceipt {
  status: 0 | 1
  blockNumber: bigint
  blockHash: string
  transfers: TransferLog[]
}

// Read-only view of one chain. The live implementation (JSON-RPC eth_getLogs / eth_getTransactionReceipt /
// eth_getBlockByNumber) is a later phase; Phase 4 uses a simulated reader in tests.
export interface ChainReader {
  network: string
  findAuthorizationUsed(asset: string, authorizer: string, nonce: string, fromBlock: bigint): Promise<AuthorizationUsedEvent[]>
  getReceipt(txHash: string): Promise<TxReceipt | null>
  getTaggedBlockNumber(tag: 'latest' | 'safe' | 'finalized'): Promise<bigint>
  getCanonicalBlockHash(blockNumber: bigint): Promise<string | null>
}

export type FinalityPolicy = { kind: 'pos-checkpoint-tags'; description: string }

// Only networks with an explicitly reviewed finality rule are accepted. Anything else is refused, not guessed.
// Ethereum Sepolia is proof-of-stake: "safe" and "finalized" block tags reflect the Casper FFG checkpoints.
const POLICIES: Record<string, FinalityPolicy> = {
  'eip155:11155111': {
    kind: 'pos-checkpoint-tags',
    description: 'Ethereum Sepolia: final when the block is at or below the "finalized" checkpoint and its hash is still canonical.',
  },
}

export function finalityPolicyFor(network: string): FinalityPolicy | null {
  return POLICIES[network] ?? null
}
