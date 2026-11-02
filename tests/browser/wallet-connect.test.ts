// Tests the real Connect Wallet handlers in src/dashboard/wallet.ts with a simulated injected provider.
// No real wallet, key or network is used.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (args: { method: string; params?: unknown[] }) => Promise<unknown>

function provider(handler: Handler) {
  const calls: string[] = []
  return {
    calls,
    eth: {
      request: (args: { method: string; params?: unknown[] }) => {
        calls.push(args.method)
        return handler(args)
      },
      on: () => {},
    },
  }
}

const ADDRESS = '0x' + 'ab'.repeat(20)
const providerError = (code: number) => Object.assign(new Error('provider error'), { code })

async function loadWallet(eth?: unknown) {
  const store = new Map<string, string>()
  vi.stubGlobal('window', { ethereum: eth })
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
  vi.resetModules()
  return { wallet: await import('../../src/dashboard/wallet'), store }
}

describe('Connect Wallet handler (injected EVM wallet)', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('connects: requests accounts, reads the address and the chain', async () => {
    const p = provider(async ({ method }) => (method === 'eth_requestAccounts' ? [ADDRESS] : method === 'eth_chainId' ? '0xaa36a7' : null))
    const { wallet, store } = await loadWallet(p.eth)
    await wallet.connectWallet()
    const s = wallet.getWalletState()
    expect(p.calls).toEqual(['eth_requestAccounts', 'eth_chainId'])
    expect(s).toMatchObject({ address: ADDRESS, chainId: 11155111, connecting: false, error: null, available: true })
    expect(wallet.isSupportedChain(s.chainId)).toBe(true)
    expect(wallet.shortAddress(ADDRESS)).toBe('0xabab…abab')
    expect(store.get('dos:wallet-connected')).toBe('1')
  })

  it('reports a missing wallet without throwing', async () => {
    const { wallet } = await loadWallet(undefined)
    await wallet.connectWallet()
    const s = wallet.getWalletState()
    expect(s.address).toBeNull()
    expect(s.available).toBe(false)
    expect(s.error).toMatch(/No browser wallet found/)
  })

  it('handles a rejected connection request gracefully', async () => {
    const p = provider(async () => {
      throw providerError(4001)
    })
    const { wallet } = await loadWallet(p.eth)
    await wallet.connectWallet()
    expect(wallet.getWalletState()).toMatchObject({ address: null, connecting: false, error: 'The request was rejected in your wallet.' })
  })

  it('explains an already-open wallet request', async () => {
    const p = provider(async () => {
      throw providerError(-32002)
    })
    const { wallet } = await loadWallet(p.eth)
    await wallet.connectWallet()
    expect(wallet.getWalletState().error).toMatch(/already open in your wallet/)
  })

  it('does not show raw provider error messages', async () => {
    const p = provider(async () => {
      throw new Error('internal provider detail https://rpc.example/secret-key')
    })
    const { wallet } = await loadWallet(p.eth)
    await wallet.connectWallet()
    expect(wallet.getWalletState().error).toBe('Could not connect to your wallet. Please try again.')
  })

  it('detects the wrong network and switches to Sepolia on request', async () => {
    let chain = '0x1'
    const p = provider(async ({ method, params }) => {
      if (method === 'eth_requestAccounts') return [ADDRESS]
      if (method === 'eth_chainId') return chain
      if (method === 'wallet_switchEthereumChain') {
        chain = (params?.[0] as { chainId: string }).chainId
        return null
      }
      return null
    })
    const { wallet } = await loadWallet(p.eth)
    await wallet.connectWallet()
    expect(wallet.getWalletState().chainId).toBe(1)
    expect(wallet.isSupportedChain(1)).toBe(false)
    await wallet.switchToSupportedChain()
    expect(chain).toBe('0xaa36a7')
    expect(wallet.getWalletState().chainId).toBe(11155111)
  })

  it('reports a refused or unavailable network switch', async () => {
    const refused = provider(async ({ method }) => {
      if (method === 'wallet_switchEthereumChain') throw providerError(4001)
      return method === 'eth_requestAccounts' ? [ADDRESS] : '0x1'
    })
    let { wallet } = await loadWallet(refused.eth)
    await wallet.connectWallet()
    await wallet.switchToSupportedChain()
    expect(wallet.getWalletState()).toMatchObject({ chainId: 1, error: 'The request was rejected in your wallet.' })

    const missing = provider(async ({ method }) => {
      if (method === 'wallet_switchEthereumChain') throw providerError(4902)
      return method === 'eth_requestAccounts' ? [ADDRESS] : '0x1'
    })
    ;({ wallet } = await loadWallet(missing.eth))
    await wallet.connectWallet()
    await wallet.switchToSupportedChain()
    expect(wallet.getWalletState().error).toMatch(/Sepolia is not set up in your wallet/)
  })

  it('ignores a second click while a connection request is pending', async () => {
    let resolve!: (v: unknown) => void
    const p = provider(({ method }) => (method === 'eth_requestAccounts' ? new Promise((r) => (resolve = r)) : Promise.resolve('0xaa36a7')))
    const { wallet } = await loadWallet(p.eth)
    const first = wallet.connectWallet()
    await wallet.connectWallet()
    expect(p.calls.filter((c) => c === 'eth_requestAccounts')).toHaveLength(1)
    resolve([ADDRESS])
    await first
    expect(wallet.getWalletState().address).toBe(ADDRESS)
  })
})
