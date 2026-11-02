import { useEffect, useRef, useState } from 'react'
import { connectWallet, discoverWallets, useWallet } from './wallet'

// "Connect Wallet" button that opens a list of the wallets detected in this browser, each with its own icon.
export default function WalletPicker({ className = 'btn btn--dark', align = 'right' }: { className?: string; align?: 'left' | 'right' }) {
  const w = useWallet()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const toggle = () => {
    if (!open) discoverWallets()
    setOpen((o) => !o)
  }
  const pick = async (id: string) => {
    setPending(id)
    await connectWallet(id)
    setPending(null)
    setOpen(false)
  }
  const pendingName = w.wallets.find((x) => x.id === pending)?.name

  return (
    <div className="wallet-picker" ref={ref}>
      <button className={className} type="button" onClick={toggle} disabled={w.connecting} aria-haspopup="dialog" aria-expanded={open}>
        {w.connecting ? `Waiting for ${pendingName ?? 'wallet'}…` : 'Connect Wallet'}
      </button>
      {open && !w.connecting && (
        <div className={`wallet__menu wallet-picker__menu wallet-picker__menu--${align}`} role="dialog" aria-label="Choose a wallet">
          <p className="wallet-picker__title">Choose a wallet</p>
          {w.wallets.length ? (
            <ul className="wallet-picker__list">
              {w.wallets.map((x) => (
                <li key={x.id}>
                  <button type="button" className="wallet-picker__item" onClick={() => void pick(x.id)}>
                    {x.icon ? (
                      <img className="wallet-picker__icon" src={x.icon} alt="" width={28} height={28} />
                    ) : (
                      <span className="wallet-picker__icon wallet-picker__icon--generic" aria-hidden="true">
                        {x.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="wallet-picker__name">{x.name}</span>
                    <span className="wallet-picker__tag">Detected</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="wallet__note">
              No wallet detected in this browser. Install a wallet extension such as MetaMask, or open this site in your wallet app’s browser.
            </p>
          )}
          <p className="wallet__note">Connecting only shares your address. This app never requests transactions or moves funds.</p>
        </div>
      )}
    </div>
  )
}
