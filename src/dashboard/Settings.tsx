import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { fmtUsd, usePoolsData } from './data'
import {
  DEFAULT_PREFS,
  hasResearchPrefs,
  Preferences,
  RiskPref,
  RISK_LABEL,
  usePrefs,
  useReports,
  useResolvedTheme,
  useThemePref,
  useWatchlist,
} from './store'
import { signInWithWallet, signOutSession, useAuth } from './auth'
import { chainName, connectWallet, disconnectWallet, shortAddress, useWallet } from './wallet'
import { Chain, Check, ConfirmDialog, PageHeader, Segmented, Select, Switch } from './ui'

const FALLBACK_NETWORKS = ['Ethereum', 'Arbitrum', 'Base', 'Optimism', 'Polygon', 'BSC', 'Avalanche', 'Solana']
const ASSET_SUGGESTIONS = ['USDC', 'USDT', 'DAI', 'ETH', 'WBTC', 'SOL']
const TVL_OPTIONS = [
  { value: '', label: 'No minimum' },
  { value: '100000', label: '$100K' },
  { value: '1000000', label: '$1M' },
  { value: '10000000', label: '$10M' },
  { value: '100000000', label: '$100M' },
]

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  return (
    <section className="set-sec" id={id} aria-labelledby={`${id}-h`}>
      <header className="set-sec__head">
        <h2 id={`${id}-h`}>{title}</h2>
        <p>{description}</p>
      </header>
      <div className="set-sec__body">{children}</div>
    </section>
  )
}

function Row({ label, hint, children, stack }: { label: string; hint?: ReactNode; children: ReactNode; stack?: boolean }) {
  return (
    <div className={`set-row${stack ? ' set-row--stack' : ''}`}>
      <div className="set-row__label">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      <div className="set-row__control">{children}</div>
    </div>
  )
}

function NumberInput({
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
  label,
}: {
  value: number | null
  onChange: (v: number | null) => void
  prefix?: string
  suffix?: string
  placeholder: string
  label: string
}) {
  const [text, setText] = useState(value == null ? '' : String(value))
  useEffect(() => {
    if (value == null && text !== '') setText('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <label className="affix">
      {prefix && <span>{prefix}</span>}
      <input
        inputMode="decimal"
        aria-label={label}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.]/g, '')
          setText(t)
          if (t === '') onChange(null)
          else if (!isNaN(Number(t))) onChange(Number(t))
        }}
      />
      {suffix && <span>{suffix}</span>}
    </label>
  )
}

function AssetPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState('')
  const add = (raw: string) => {
    const a = raw.trim().toUpperCase().replace(/[^A-Z0-9.]/g, '')
    if (a && !value.includes(a)) onChange([...value, a])
    setText('')
  }
  const suggestions = ASSET_SUGGESTIONS.filter((s) => !value.includes(s))
  return (
    <div className="assets">
      <div className="chips">
        {value.map((a) => (
          <span key={a} className="chip">
            {a}
            <button type="button" aria-label={`Remove ${a}`} onClick={() => onChange(value.filter((x) => x !== a))}>
              ×
            </button>
          </span>
        ))}
        <input
          className="chips__input"
          placeholder={value.length ? 'Add another…' : 'Type an asset, e.g. USDC'}
          aria-label="Add preferred asset"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              add(text)
            } else if (e.key === 'Backspace' && !text && value.length) {
              onChange(value.slice(0, -1))
            }
          }}
          onBlur={() => text && add(text)}
        />
      </div>
      {suggestions.length > 0 && (
        <div className="suggest">
          <span>Quick add:</span>
          {suggestions.map((s) => (
            <button key={s} type="button" className="chip chip--ghost" onClick={() => add(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

type Pending = null | 'watchlist' | 'history' | 'prefs'

export default function Settings() {
  const w = useWallet()
  const auth = useAuth()
  const [prefs, setPrefsRaw] = usePrefs()
  const [themePref, setThemePref] = useThemePref()
  const theme = useResolvedTheme()
  const [watch, setWatch] = useWatchlist()
  const [reports, setReports] = useReports()
  const data = usePoolsData()
  const [saved, setSaved] = useState(0)
  const [copied, setCopied] = useState(false)
  const [pending, setPending] = useState<Pending>(null)
  const [done, setDone] = useState<string | null>(null)
  const timer = useRef<number>()

  const flash = () => {
    setSaved(Date.now())
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setSaved(0), 1600)
  }
  const setPrefs = (patch: Partial<Preferences>) => {
    setPrefsRaw({ ...prefs, ...patch })
    flash()
  }

  const networks = useMemo(() => {
    if (data.status !== 'ready') return [...new Set([...FALLBACK_NETWORKS, ...prefs.networks])]
    const tvl = new Map<string, number>()
    data.pools.forEach((p) => tvl.set(p.chain, (tvl.get(p.chain) ?? 0) + p.tvlUsd))
    const top = [...tvl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([c]) => c)
    return [...new Set([...top, ...prefs.networks])]
  }, [data, prefs.networks])

  const copy = async () => {
    if (!w.address) return
    try {
      await navigator.clipboard.writeText(w.address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  const confirmAction = () => {
    if (pending === 'watchlist') {
      setWatch([])
      setDone('Watchlist cleared.')
    } else if (pending === 'history') {
      setReports([])
      setDone('Research history cleared.')
    } else if (pending === 'prefs') {
      setPrefsRaw(DEFAULT_PREFS)
      setDone('Preferences reset to defaults.')
    }
    setPending(null)
    setTimeout(() => setDone(null), 2500)
  }

  const budgetInvalid = prefs.budgetMin != null && prefs.budgetMax != null && prefs.budgetMin > prefs.budgetMax
  const status = w.address ? 'connected' : w.available ? 'disconnected' : 'unavailable'

  return (
    <div className="settings-page">
      <PageHeader
        title="Settings"
        description="Manage your account, research preferences and data."
        actions={
          <span className={`autosave${saved ? ' is-saved' : ''}`} aria-live="polite">
            {saved ? '✓ Saved' : 'Changes save automatically'}
          </span>
        }
      />

      <nav className="set-nav" aria-label="Settings sections">
        {[
          ['account', 'Account'],
          ['research', 'Research'],
          ['opportunity', 'Opportunities'],
          ['appearance', 'Appearance'],
          ['privacy', 'Privacy & Data'],
        ].map(([id, l]) => (
          <a key={id} href={`#${id}`}>
            {l}
          </a>
        ))}
      </nav>

      <Section id="account" title="Account" description="Your wallet is used only to identify you. This app never requests transactions.">
        <Row label="Status">
          <span className={`conn conn--${status}`}>
            <i aria-hidden="true" />
            {status === 'connected' ? 'Connected' : status === 'disconnected' ? 'Not connected' : 'No browser wallet detected'}
          </span>
        </Row>
        <Row label="Wallet address">
          {w.address ? (
            <div className="addr">
              <code>{w.address}</code>
              <button type="button" className="btn btn--light btn--sm" onClick={copy}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          ) : (
            <span className="muted">—</span>
          )}
        </Row>
        {w.address && (
          <Row label="Network">
            <span>{chainName(w.chainId) ?? 'Unknown'}</span>
          </Row>
        )}
        <Row label={w.address ? 'Disconnect' : 'Connect'} hint={!w.available && !w.address ? 'On mobile, open this site in your wallet app’s browser.' : undefined}>
          {w.address ? (
            <button className="btn btn--light btn--sm" type="button" onClick={disconnectWallet}>
              Disconnect wallet
            </button>
          ) : (
            <button className="btn btn--dark btn--sm" type="button" onClick={connectWallet} disabled={w.connecting}>
              {w.connecting ? 'Waiting for wallet…' : 'Connect Wallet'}
            </button>
          )}
          {w.error && <p className="set-error">{w.error}</p>}
        </Row>
        <Row label="Session" hint="Signing in uses a free message signature, not a transaction.">
          <span className={`conn conn--${auth.status === 'signed_in' ? 'connected' : 'disconnected'}`}>
            <i aria-hidden="true" />
            {auth.status === 'signed_in' && auth.address
              ? `Signed in as ${shortAddress(auth.address)}`
              : auth.status === 'checking'
                ? 'Checking…'
                : auth.status === 'unavailable'
                  ? 'Sign-in unavailable'
                  : 'Not signed in'}
          </span>
          {auth.status === 'signed_in' ? (
            <button className="btn btn--light btn--sm" type="button" onClick={() => void signOutSession()}>
              Sign out
            </button>
          ) : (
            w.address && (
              <button
                className="btn btn--dark btn--sm"
                type="button"
                onClick={() => void signInWithWallet(w.address)}
                disabled={auth.status === 'signing' || auth.status === 'checking' || auth.status === 'signing_out'}
              >
                {auth.status === 'signing' ? 'Check your wallet…' : 'Sign in'}
              </button>
            )
          )}
          {auth.error && <p className="set-error" role="alert">{auth.error}</p>}
        </Row>
      </Section>

      <Section id="research" title="Research Preferences" description="Used to rank opportunities and evaluate research reports. Not a guarantee of safety or suitability.">
        <Row label="Risk preference">
          <Segmented<RiskPref>
            name="Risk preference"
            value={prefs.risk}
            onChange={(risk) => setPrefs({ risk })}
            options={(Object.keys(RISK_LABEL) as RiskPref[]).map((v) => ({ value: v, label: RISK_LABEL[v] }))}
          />
        </Row>
        <Row label="Budget range" hint={budgetInvalid ? <span className="set-warn">Minimum is higher than maximum.</span> : 'Compared with pool size in reports.'}>
          <div className="pair">
            <NumberInput label="Minimum budget" prefix="$" placeholder="Min" value={prefs.budgetMin} onChange={(budgetMin) => setPrefs({ budgetMin })} />
            <span className="pair__dash">–</span>
            <NumberInput label="Maximum budget" prefix="$" placeholder="Max" value={prefs.budgetMax} onChange={(budgetMax) => setPrefs({ budgetMax })} />
          </div>
        </Row>
        <Row label="Preferred networks" hint={prefs.networks.length ? `${prefs.networks.length} selected` : 'None selected — all networks'} stack>
          <div className="net-grid">
            {networks.map((n) => (
              <Check
                key={n}
                checked={prefs.networks.includes(n)}
                onChange={(on) => setPrefs({ networks: on ? [...prefs.networks, n] : prefs.networks.filter((x) => x !== n) })}
              >
                <Chain chain={n} size={18} />
              </Check>
            ))}
          </div>
        </Row>
        <Row label="Preferred assets" hint="Matches any token in a pool, e.g. ETH matches WETH and stETH." stack>
          <AssetPicker value={prefs.assets} onChange={(assets) => setPrefs({ assets })} />
        </Row>
      </Section>

      <Section id="opportunity" title="Opportunity Preferences" description="Applied to Discover on top of its own filters.">
        <Row label="Minimum APY">
          <NumberInput label="Minimum APY" suffix="%" placeholder="Any" value={prefs.minApy} onChange={(minApy) => setPrefs({ minApy })} />
        </Row>
        <Row label="Minimum TVL">
          <div className="set-select">
            <Select
              label="Minimum TVL"
              value={prefs.minTvl == null ? '' : String(prefs.minTvl)}
              onChange={(v) => setPrefs({ minTvl: v ? Number(v) : null })}
              options={TVL_OPTIONS}
            />
          </div>
        </Row>
        <Row label="Stablecoin opportunities only">
          <Switch checked={prefs.stableOnly} onChange={(stableOnly) => setPrefs({ stableOnly })} label={prefs.stableOnly ? 'On' : 'Off'} />
        </Row>
        <Row
          label="Hide opportunities that don’t match"
          hint={hasResearchPrefs(prefs) ? 'Based on your preferred networks and assets.' : 'Set preferred networks or assets first.'}
        >
          <Switch
            checked={prefs.hideNonMatching && hasResearchPrefs(prefs)}
            disabled={!hasResearchPrefs(prefs)}
            onChange={(hideNonMatching) => setPrefs({ hideNonMatching })}
            label={prefs.hideNonMatching && hasResearchPrefs(prefs) ? 'On' : 'Off'}
          />
        </Row>
      </Section>

      <Section id="appearance" title="Appearance" description="Applies to the dashboard.">
        <Row label="Theme">
          <Segmented<'light' | 'dark'>
            name="Theme"
            value={theme}
            onChange={(t) => setThemePref(t)}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </Row>
        <Row label="Match system theme" hint="Follows your device’s light or dark setting.">
          <Switch
            checked={themePref === 'system'}
            onChange={(on) => setThemePref(on ? 'system' : theme)}
            label={themePref === 'system' ? 'On' : 'Off'}
          />
        </Row>
      </Section>

      <Section id="privacy" title="Privacy & Data" description="Everything is stored only in this browser. Nothing is sent to a server.">
        <Row label="Watchlist" hint={`${watch.length} saved ${watch.length === 1 ? 'opportunity' : 'opportunities'}`}>
          <button className="btn btn--danger-ghost btn--sm" type="button" disabled={!watch.length} onClick={() => setPending('watchlist')}>
            Clear watchlist
          </button>
        </Row>
        <Row label="Research history" hint={`${reports.length} ${reports.length === 1 ? 'report' : 'reports'}`}>
          <button className="btn btn--danger-ghost btn--sm" type="button" disabled={!reports.length} onClick={() => setPending('history')}>
            Clear research history
          </button>
        </Row>
        <Row label="Preferences" hint="Research and opportunity preferences.">
          <button className="btn btn--danger-ghost btn--sm" type="button" onClick={() => setPending('prefs')}>
            Reset preferences
          </button>
        </Row>
        {done && (
          <p className="set-done" role="status">
            ✓ {done}
          </p>
        )}
      </Section>

      <ConfirmDialog
        open={pending !== null}
        title={pending === 'watchlist' ? 'Clear watchlist?' : pending === 'history' ? 'Clear research history?' : 'Reset preferences?'}
        confirmLabel={pending === 'watchlist' ? 'Clear watchlist' : pending === 'history' ? 'Clear history' : 'Reset'}
        onConfirm={confirmAction}
        onCancel={() => setPending(null)}
      >
        {pending === 'watchlist' && `This removes all ${watch.length} saved opportunities. This can’t be undone.`}
        {pending === 'history' && `This deletes all ${reports.length} research reports. This can’t be undone.`}
        {pending === 'prefs' &&
          `Risk, budget (${prefs.budgetMax != null ? fmtUsd(prefs.budgetMax) : 'not set'} max), networks, assets and opportunity filters go back to defaults. Your watchlist, history and theme are kept.`}
      </ConfirmDialog>
    </div>
  )
}
