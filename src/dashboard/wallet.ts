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

export async function connectWallet() {
  if (!window.ethereum) {
    set({ error: 'No browser wallet found. Install a wallet extension such as MetaMask, or open this site in your wallet app’s browser.' })
    return
  }
  set({ connecting: true, error: null })
  try {
    const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[]
    set({ address: accounts[0] ?? null, connecting: false })
    localStorage.setItem(FLAG, '1')
    await readChain()
  } catch (e) {
    const msg = (e as { message?: string }).message ?? 'Connection was rejected.'
    set({ connecting: false, error: msg })
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
