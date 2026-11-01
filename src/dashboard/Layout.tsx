import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useCompare, useResolvedTheme, useWatchlist } from './store'
import { chainName, connectWallet, disconnectWallet, shortAddress, useWallet } from './wallet'

function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="4" />
      <rect x="14" y="0" width="4" height="9" rx="2" fill="currentColor" />
      <rect x="14" y="23" width="4" height="9" rx="2" fill="currentColor" />
      <rect x="0" y="14" width="9" height="4" rx="2" fill="currentColor" />
      <rect x="23" y="14" width="9" height="4" rx="2" fill="currentColor" />
      <circle cx="16" cy="16" r="3.5" fill="currentColor" />
    </svg>
  )
}

function WalletControl() {
  const w = useWallet()
  const [open, setOpen] = useState(false)
  if (!w.address) {
    return (
      <div className="wallet">
        <button className="btn btn--dark" type="button" onClick={connectWallet} disabled={w.connecting}>
          {w.connecting ? 'Waiting for wallet…' : 'Connect Wallet'}
        </button>
        {w.error && <p className="wallet__error">{w.error}</p>}
      </div>
    )
  }
  return (
    <div className="wallet">
      {w.chainId != null && (
        <span className="badge badge--neutral wallet__chain" title="Network reported by your wallet">
          <i className="pulse" aria-hidden="true" />
          {chainName(w.chainId)}
        </span>
      )}
      <button className="btn btn--light wallet__addr" type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {shortAddress(w.address)}
      </button>
      {open && (
        <div className="wallet__menu">
          <p className="mono">{w.address}</p>
          <p className="wallet__note">Read-only connection. This app never requests transactions or moves funds.</p>
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
    </div>
  )
}

export default function Layout() {
  const [compare] = useCompare()
  const [watch] = useWatchlist()
  const { pathname } = useLocation()
  const theme = useResolvedTheme()
  useEffect(() => {
    const root = document.documentElement
    root.dataset.dashTheme = theme
    return () => {
      delete root.dataset.dashTheme
    }
  }, [theme])
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  const tabs = [
    { to: 'discover', label: 'Discover' },
    { to: 'compare', label: 'Compare', count: compare.length },
    { to: 'watchlist', label: 'Watchlist', count: watch.length },
    { to: 'history', label: 'Research History' },
    { to: 'settings', label: 'Settings' },
  ]

  return (
    <div className="dash" data-theme={theme}>
      <header className="topbar">
        <div className="topbar__row">
          <Link to="/" className="topbar__brand">
            <Mark />
            <span>DeFi Opportunity Scout</span>
          </Link>
          <div className="topbar__right">
            <WalletControl />
            <NavLink to="settings" className="icon-btn" aria-label="Settings" title="Settings">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" fill="none" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </NavLink>
          </div>
        </div>
        <nav className="tabs" aria-label="Dashboard">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} className={({ isActive }) => `tab${isActive ? ' is-active' : ''}`}>
              {t.label}
              {!!t.count && <span className="tab__count">{t.count}</span>}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="dash__main">
        <Outlet />
      </main>
      <footer className="dash__foot">
        Research only — not financial advice. No deposits, withdrawals, swaps or custody of funds. Market data: DefiLlama.
      </footer>
    </div>
  )
}
