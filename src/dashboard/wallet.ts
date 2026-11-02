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

// A wallet found in this browser. EIP-6963 wallets announce their own name and icon;
// a bare window.ethereum with no announcement is listed as a generic "Browser wallet".
export interface DetectedWallet {
  id: string
  name: string
  icon: string | null
  provider: Eip1193
}

export interface WalletState {
  available: boolean
  wallets: DetectedWallet[]
  walletId: string | null
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
  wallets: [],
  walletId: null,
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

const LEGACY_ID = 'injected'
const WALLET_KEY = 'dos:wallet-id'
let announced: DetectedWallet[] = []
let active: Eip1193 | null = null

// Wallet icons are shown with <img>, which never runs scripts; still, only image data URIs are accepted.
function safeIcon(icon: unknown): string | null {
  return typeof icon === 'string' && /^data:image\/(png|jpeg|gif|webp|svg\+xml)[;,]/i.test(icon) && icon.length < 200_000 ? icon : null
}

function legacyProvider(): Eip1193 | undefined {
  return typeof window !== 'undefined' ? window.ethereum : undefined
}

function refreshWallets() {
  const list = [...announced]
  const legacy = legacyProvider()
  if (legacy && !list.some((w) => w.provider === legacy)) {
    list.push({ id: LEGACY_ID, name: list.length ? 'Other browser wallet' : 'Browser wallet', icon: null, provider: legacy })
  }
  set({ wallets: list, available: list.length > 0 })
}

function onAnnounce(e: Event) {
  const d = (e as CustomEvent).detail as { info?: { uuid?: unknown; name?: unknown; icon?: unknown; rdns?: unknown }; provider?: Eip1193 } | undefined
  const info = d?.info
  if (!info || !d?.provider || typeof d.provider.request !== 'function') return
  const id = typeof info.rdns === 'string' && info.rdns ? info.rdns : typeof info.uuid === 'string' ? info.uuid : ''
  const name = typeof info.name === 'string' ? info.name.trim().slice(0, 40) : ''
  if (!id || !name || announced.some((w) => w.id === id)) return
  announced = [...announced, { id, name, icon: safeIcon(info.icon), provider: d.provider }]
  refreshWallets()
}

let discovering = false
// Asks installed wallets to announce themselves (EIP-6963). Safe to call more than once.
export function discoverWallets() {
  if (typeof window === 'undefined') return
  if (!discovering && typeof window.addEventListener === 'function') {
    discovering = true
    window.addEventListener('eip6963:announceProvider', onAnnounce)
  }
  if (typeof window.dispatchEvent === 'function' && typeof Event === 'function') window.dispatchEvent(new Event('eip6963:requestProvider'))
  refreshWallets()
}

// The provider the user picked, used for chain checks and sign-in.
export function getActiveProvider(): Eip1193 | undefined {
  return active ?? legacyProvider()
}

async function readChain() {
  const eth = getActiveProvider()
  if (!eth) return set({ chainId: null })
  try {
    const hex = (await eth.request({ method: 'eth_chainId' })) as string
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

// Connects the wallet with the given id (from the picker). With no id, uses the only/last-used wallet.
export async function connectWallet(walletId?: string) {
  if (state.connecting) return
  refreshWallets()
  const id = typeof walletId === 'string' ? walletId : null
  const chosen = id ? state.wallets.find((w) => w.id === id) : state.wallets[0]
  const eth = chosen?.provider
  if (!eth) {
    set({ available: state.wallets.length > 0, error: id ? 'That wallet is no longer available. Reload the page and try again.' : NO_WALLET })
    return
  }
  set({ available: true, connecting: true, error: null })
  try {
    const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[]
    if (!Array.isArray(accounts) || !accounts.length) {
      set({ connecting: false, error: 'No account was shared by your wallet.' })
      return
    }
    setActiveProvider(eth)
    set({ address: accounts[0], connecting: false, walletId: chosen.id })
    try {
      localStorage.setItem(FLAG, '1')
      localStorage.setItem(WALLET_KEY, chosen.id)
    } catch {
      /* storage unavailable: only affects reconnecting after reload */
    }
    await readChain()
  } catch (e) {
    set({ connecting: false, error: providerErrorText(e, 'Could not connect to your wallet. Please try again.') })
  }
}

export async function switchToSupportedChain() {
  const eth = getActiveProvider()
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
    localStorage.removeItem(WALLET_KEY)
  } catch {
    /* ignore */
  }
  setActiveProvider(null)
  set({ address: null, chainId: null, error: null, walletId: null })
}

const onAccounts = (a: unknown) => {
  const accounts = a as string[]
  if (!accounts.length) return disconnectWallet()
  set({ address: accounts[0] })
}
const onChain = (hex: unknown) => set({ chainId: parseInt(hex as string, 16) })

// Listens to events from the picked wallet only, so another installed wallet cannot change the state.
function setActiveProvider(eth: Eip1193 | null) {
  if (active === eth) return
  active?.removeListener?.('accountsChanged', onAccounts)
  active?.removeListener?.('chainChanged', onChain)
  active = eth
  eth?.on?.('accountsChanged', onAccounts)
  eth?.on?.('chainChanged', onChain)
}

let initialised = false
function init() {
  if (initialised || typeof window === 'undefined') return
  initialised = true
  discoverWallets()
  let wasConnected = false
  let savedId: string | null = null
  try {
    wasConnected = localStorage.getItem(FLAG) === '1'
    savedId = localStorage.getItem(WALLET_KEY)
  } catch {
    /* ignore */
  }
  if (!wasConnected) return
  // Wallets announce asynchronously; give them a moment before restoring the last connection.
  setTimeout(() => {
    const w = state.wallets.find((x) => x.id === savedId) ?? (savedId ? undefined : state.wallets[0])
    if (!w || state.address) return
    w.provider
      .request({ method: 'eth_accounts' })
      .then((a) => {
        const accounts = a as string[]
        if (accounts.length && !state.address) {
          setActiveProvider(w.provider)
          set({ address: accounts[0], walletId: w.id })
          readChain()
        }
      })
      .catch(() => {})
  }, 300)
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
