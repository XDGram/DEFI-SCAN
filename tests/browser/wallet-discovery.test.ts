// Tests wallet detection (EIP-6963) and picking a wallet, with simulated wallets. No real wallet or network is used.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ADDRESS = '0x' + 'cd'.repeat(20)
const PNG = 'data:image/png;base64,iVBORw0KGgo='

function fakeProvider(account = ADDRESS) {
  const calls: string[] = []
  const handlers = new Map<string, (v: unknown) => void>()
  return {
    calls,
    handlers,
    request: async ({ method }: { method: string }) => {
      calls.push(method)
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account]
      if (method === 'eth_chainId') return '0xaa36a7'
      return null
    },
    on: (ev: string, cb: (v: unknown) => void) => void handlers.set(ev, cb),
    removeListener: (ev: string) => void handlers.delete(ev),
  }
}

type Wallet = { info: { uuid: string; name: string; icon: string; rdns: string }; provider: ReturnType<typeof fakeProvider> }

// A window that answers eip6963:requestProvider by announcing the given wallets, like real extensions do.
async function load(wallets: Wallet[], ethereum?: unknown) {
  const target = new EventTarget()
  target.addEventListener('eip6963:requestProvider', () => {
    for (const w of wallets) target.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ ...w }) }))
  })
  const win = Object.assign(target, { ethereum })
  const store = new Map<string, string>()
  vi.stubGlobal('window', win)
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
  vi.resetModules()
  const wallet = await import('../../src/dashboard/wallet')
  wallet.discoverWallets()
  return { wallet, store }
}

const mm = (): Wallet => ({ info: { uuid: 'u1', name: 'MetaMask', icon: PNG, rdns: 'io.metamask' }, provider: fakeProvider() })
const rabby = (): Wallet => ({ info: { uuid: 'u2', name: 'Rabby Wallet', icon: PNG, rdns: 'io.rabby' }, provider: fakeProvider('0x' + 'ef'.repeat(20)) })

describe('wallet picker: detection', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('lists every announced wallet with its name and icon', async () => {
    const { wallet } = await load([mm(), rabby()])
    const list = wallet.getWalletState().wallets
    expect(list.map((w) => [w.id, w.name, w.icon])).toEqual([
      ['io.metamask', 'MetaMask', PNG],
      ['io.rabby', 'Rabby Wallet', PNG],
    ])
    expect(wallet.getWalletState().available).toBe(true)
  })

  it('does not list the same wallet twice when it announces again', async () => {
    const { wallet } = await load([mm()])
    wallet.discoverWallets()
    expect(wallet.getWalletState().wallets).toHaveLength(1)
  })

  it('does not duplicate a wallet that is both announced and window.ethereum', async () => {
    const m = mm()
    const { wallet } = await load([m], m.provider)
    expect(wallet.getWalletState().wallets.map((w) => w.name)).toEqual(['MetaMask'])
  })

  it('lists a wallet that only sets window.ethereum as "Browser wallet" with no icon', async () => {
    const { wallet } = await load([], fakeProvider())
    expect(wallet.getWalletState().wallets.map((w) => [w.id, w.name, w.icon])).toEqual([['injected', 'Browser wallet', null]])
  })

  it('shows nothing and reports no wallet when none is installed', async () => {
    const { wallet } = await load([])
    expect(wallet.getWalletState()).toMatchObject({ wallets: [], available: false })
  })

  it('refuses icons that are not image data URIs', async () => {
    const bad = mm()
    bad.info.icon = 'javascript:alert(1)'
    const remote = rabby()
    remote.info.icon = 'https://tracker.example/icon.png'
    const { wallet } = await load([bad, remote])
    expect(wallet.getWalletState().wallets.map((w) => w.icon)).toEqual([null, null])
  })

  it('ignores malformed announcements', async () => {
    const noProvider = { info: { uuid: 'x', name: 'Broken', icon: PNG, rdns: 'x.broken' }, provider: {} } as unknown as Wallet
    const noName = { ...mm(), info: { uuid: 'y', name: '', icon: PNG, rdns: 'y.noname' } }
    const { wallet } = await load([noProvider, noName])
    expect(wallet.getWalletState().wallets).toEqual([])
  })
})

describe('wallet picker: connecting the chosen wallet', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('asks only the chosen wallet for accounts and uses it for sign-in', async () => {
    const m = mm()
    const r = rabby()
    const { wallet, store } = await load([m, r])
    await wallet.connectWallet('io.rabby')
    expect(r.provider.calls).toEqual(['eth_requestAccounts', 'eth_chainId'])
    expect(m.provider.calls).toEqual([])
    expect(wallet.getWalletState()).toMatchObject({ address: '0x' + 'ef'.repeat(20), walletId: 'io.rabby', chainId: 11155111 })
    expect(wallet.getActiveProvider()).toBe(r.provider)
    expect(store.get('dos:wallet-id')).toBe('io.rabby')
  })

  it('follows account and network changes from the chosen wallet only', async () => {
    const m = mm()
    const r = rabby()
    const { wallet } = await load([m, r])
    await wallet.connectWallet('io.metamask')
    expect(r.provider.handlers.size).toBe(0)
    m.provider.handlers.get('chainChanged')!('0x1')
    expect(wallet.getWalletState().chainId).toBe(1)
    m.provider.handlers.get('accountsChanged')!([])
    expect(wallet.getWalletState().address).toBeNull()
    expect(m.provider.handlers.size).toBe(0)
  })

  it('reports a wallet that disappeared', async () => {
    const { wallet } = await load([mm()])
    await wallet.connectWallet('io.gone')
    expect(wallet.getWalletState()).toMatchObject({ address: null, error: expect.stringMatching(/no longer available/) })
  })

  it('disconnect forgets the chosen wallet', async () => {
    const { wallet, store } = await load([mm()])
    await wallet.connectWallet('io.metamask')
    wallet.disconnectWallet()
    expect(wallet.getWalletState()).toMatchObject({ address: null, walletId: null })
    expect(wallet.getActiveProvider()).toBeUndefined()
    expect(store.has('dos:wallet-id')).toBe(false)
  })
})
