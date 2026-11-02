// Guards against the wallet button regressing to a placeholder: both navbars must render the real control.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

describe('Connect Wallet buttons use the real wallet control', () => {
  it('has no "Coming soon" placeholder on the wallet path', () => {
    for (const f of ['src/App.tsx', 'src/dashboard/Layout.tsx', 'src/dashboard/WalletControl.tsx', 'src/dashboard/wallet.ts']) {
      expect(read(f)).not.toMatch(/coming soon/i)
    }
  })

  it('renders the shared WalletControl in both the landing navbar and the dashboard top bar', () => {
    expect(read('src/App.tsx')).toMatch(/<WalletControl \/>/)
    expect(read('src/dashboard/Layout.tsx')).toMatch(/<WalletControl \/>/)
  })

  it('WalletControl wires the button to the real handlers', () => {
    const src = read('src/dashboard/WalletControl.tsx')
    expect(src).toMatch(/onClick=\{connectWallet\}/)
    expect(src).toMatch(/signInWithWallet\(w\.address\)/)
    expect(src).toMatch(/switchToSupportedChain\(\)/)
  })
})
