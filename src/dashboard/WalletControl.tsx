import { useState } from 'react'
import { signInWithWallet, signOutSession, useAuth } from './auth'
import WalletPicker from './WalletPicker'
import { chainName, disconnectWallet, isSupportedChain, shortAddress, switchToSupportedChain, useWallet } from './wallet'

// Injected-wallet connection and SIWE sign-in control, shared by the dashboard top bar and the landing navbar.
// "Signed in" is shown only when the server confirms the session (useAuth -> /api/auth/me).
export default function WalletControl() {
  const w = useWallet()
  const auth = useAuth()
  const [open, setOpen] = useState(false)
  const signedIn = auth.status === 'signed_in' && !!auth.address
  const matchesWallet = signedIn && !!w.address && auth.address === w.address.toLowerCase()
  const busy = auth.status === 'signing' || auth.status === 'checking' || auth.status === 'signing_out'
  const error = auth.error ?? w.error
  const walletName = w.wallets.find((x) => x.id === w.walletId)?.name
  const wrongNetwork = w.chainId != null && !isSupportedChain(w.chainId)

  if (!w.address) {
    return (
      <div className="wallet">
        {signedIn && (
          <span className="badge badge--live wallet__session" title="Server session active">
            Signed in · {shortAddress(auth.address!)}
          </span>
        )}
        <WalletPicker />
        {error && <p className="wallet__error" role="alert">{error}</p>}
      </div>
    )
  }
  return (
    <div className="wallet">
      {w.chainId != null && (
        <span className={`badge ${wrongNetwork ? 'badge--warn' : 'badge--neutral'} wallet__chain`} title="Network reported by your wallet">
          {!wrongNetwork && <i className="pulse" aria-hidden="true" />}
          {chainName(w.chainId)}
        </span>
      )}
      {wrongNetwork && !matchesWallet ? (
        <button className="btn btn--dark" type="button" onClick={() => void switchToSupportedChain()} title="Sign-in requires the Sepolia test network">
          Switch to Sepolia
        </button>
      ) : matchesWallet ? (
        <span className="badge badge--live wallet__session" title="Server session active">
          Signed in
        </span>
      ) : (
        <button className="btn btn--dark" type="button" onClick={() => signInWithWallet(w.address)} disabled={busy}>
          {auth.status === 'signing' ? 'Check your wallet…' : auth.status === 'checking' ? 'Checking…' : 'Sign in'}
        </button>
      )}
      <button className="btn btn--light wallet__addr" type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {shortAddress(w.address)}
      </button>
      {open && (
        <div className="wallet__menu">
          {walletName && <p className="wallet__note">Connected with {walletName}</p>}
          <p className="mono">{w.address}</p>
          <p className="wallet__note">
            {matchesWallet
              ? 'Signed in with this wallet.'
              : signedIn
                ? `Signed in as a different wallet (${shortAddress(auth.address!)}). Sign in again to switch.`
                : 'Connected, not signed in. Signing in uses a free message signature, not a transaction.'}
          </p>
          {wrongNetwork && <p className="wallet__note">Your wallet is on {chainName(w.chainId)}. Sign-in requires the Sepolia test network.</p>}
          <p className="wallet__note">This app never requests transactions or moves funds.</p>
          {signedIn && (
            <button
              className="btn btn--light"
              type="button"
              disabled={busy}
              onClick={() => {
                void signOutSession()
                setOpen(false)
              }}
            >
              {auth.status === 'signing_out' ? 'Signing out…' : 'Sign out'}
            </button>
          )}
          <button
            className="btn btn--light"
            type="button"
            onClick={() => {
              disconnectWallet()
              setOpen(false)
            }}
          >
            Disconnect
          </button>
        </div>
      )}
      {error && <p className="wallet__error" role="alert">{error}</p>}
    </div>
  )
}
