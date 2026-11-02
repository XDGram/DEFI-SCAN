import { useEffect, useSyncExternalStore } from 'react'

interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
  on?(event: string, cb: (...a: unknown[]) => void): void
  removeListener?(event: string, cb: (...a: unknown[]) => void): void
}

declare global {
  interface Window {
    ethereum?: Eip1193
  }
}

export interface WalletState {
  available: boolean
  address: string | null
  chainId: number | null
  connecting: boolean
  error: string | null
}

const FLAG = 'dos:wallet-connected'
// Sign-in messages must name this chain (the server's SIWE_CHAIN_ID default).
export const SUPPORTED_CHAIN_ID = 11155111
const CHAINS: Record<number, string> = {
  1: 'Ethereum',
  10: 'Optimism',
  56: 'BNB Chain',
  100: 'Gnosis',
  137: 'Polygon',
  324: 'zkSync Era',
  8453: 'Base',
  42161: 'Arbitrum',
  43114: 'Avalanche',
  59144: 'Linea',
  534352: 'Scroll',
  11155111: 'Sepolia (testnet)',
}

export function chainName(id: number | null): string | null {
  if (id == null) return null
  return CHAINS[id] ?? `Chain ID ${id}`
}

let state: WalletState = {
  available: typeof window !== 'undefined' && !!window.ethereum,
  address: null,
  chainId: null,
  connecting: false,
  error: null,
}
const listeners = new Set<() => void>()
let errorTimer: ReturnType<typeof setTimeout> | undefined
function set(patch: Partial<WalletState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
  if (patch.error) {
    clearTimeout(errorTimer)
    errorTimer = setTimeout(() => set({ error: null }), 6000)
  }
}

async function readChain() {
  try {
    const hex = (await window.ethereum!.request({ method: 'eth_chainId' })) as string
    set({ chainId: parseInt(hex, 16) })
  } catch {
    set({ chainId: null })
  }
}

const NO_WALLET = 'No browser wallet found. Install a wallet extension such as MetaMask, or open this site in your wallet app’s browser.'

function providerErrorText(e: unknown, fallback: string): string {
  const code = (e as { code?: unknown } | null)?.code
  if (code === 4001) return 'The request was rejected in your wallet.'
  if (code === -32002) return 'A request is already open in your wallet. Open your wallet to continue.'
  return fallback
}

export function getWalletState(): WalletState {
  return state
}

export function isSupportedChain(chainId: number | null): boolean {
  return chainId === SUPPORTED_CHAIN_ID
}

export async function connectWallet() {
  const eth = typeof window !== 'undefined' ? window.ethereum : undefined
  if (!eth) {
    set({ available: false, error: NO_WALLET })
    return
  }
  if (state.connecting) return
  set({ available: true, connecting: true, error: null })
  try {
    const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[]
    if (!Array.isArray(accounts) || !accounts.length) {
      set({ connecting: false, error: 'No account was shared by your wallet.' })
      return
    }
    set({ address: accounts[0], connecting: false })
    try {
      localStorage.setItem(FLAG, '1')
    } catch {
      /* storage unavailable: only affects reconnecting after reload */
    }
    await readChain()
  } catch (e) {
    set({ connecting: false, error: providerErrorText(e, 'Could not connect to your wallet. Please try again.') })
  }
}

export async function switchToSupportedChain() {
  const eth = typeof window !== 'undefined' ? window.ethereum : undefined
  if (!eth) {
    set({ error: NO_WALLET })
    return
  }
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${SUPPORTED_CHAIN_ID.toString(16)}` }] })
    await readChain()
  } catch (e) {
    const code = (e as { code?: unknown } | null)?.code
    set({
      error:
        code === 4902
          ? 'Sepolia is not set up in your wallet. Add the Sepolia test network in your wallet, then try again.'
          : providerErrorText(e, 'Could not switch network. Switch your wallet to Sepolia and try again.'),
    })
  }
}

export function disconnectWallet() {
  try {
    localStorage.removeItem(FLAG)
  } catch {
    /* ignore */
  }
  set({ address: null, chainId: null, error: null })
}

let initialised = false
function init() {
  if (initialised || !window.ethereum) return
  initialised = true
  const eth = window.ethereum
  eth.on?.('accountsChanged', (a) => {
    const accounts = a as string[]
    set({ address: accounts[0] ?? null })
    if (!accounts.length) disconnectWallet()
  })
  eth.on?.('chainChanged', (hex) => set({ chainId: parseInt(hex as string, 16) }))
  let wasConnected = false
  try {
    wasConnected = localStorage.getItem(FLAG) === '1'
  } catch {
    /* ignore */
  }
  if (wasConnected) {
    eth
      .request({ method: 'eth_accounts' })
      .then((a) => {
        const accounts = a as string[]
        if (accounts.length) {
          set({ address: accounts[0] })
          readChain()
        }
      })
      .catch(() => {})
  }
}

export function useWallet(): WalletState {
  useEffect(() => {
    init()
  }, [])
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

export function shortAddress(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}
