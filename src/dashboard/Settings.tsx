import { useMemo } from 'react'
import { usePoolsData } from './data'
import { DEFAULT_PREFS, RiskPref, RISK_LABEL, usePrefs } from './store'
import { chainName, connectWallet, disconnectWallet, useWallet } from './wallet'
import { Badge, Chain, Check, PageHeader, Segmented } from './ui'

const FALLBACK_NETWORKS = ['Ethereum', 'Arbitrum', 'Base', 'Optimism', 'Polygon', 'BSC', 'Avalanche', 'Solana']

export default function Settings() {
  const w = useWallet()
  const [prefs, setPrefs] = usePrefs()
  const data = usePoolsData()

  const networks = useMemo(() => {
    if (data.status !== 'ready') return FALLBACK_NETWORKS
    const tvl = new Map<string, number>()
    data.pools.forEach((p) => tvl.set(p.chain, (tvl.get(p.chain) ?? 0) + p.tvlUsd))
    const top = [...tvl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([c]) => c)
    return [...new Set([...top, ...prefs.networks])]
  }, [data, prefs.networks])

  const budget = (k: 'budgetMin' | 'budgetMax', v: string) =>
    setPrefs({ ...prefs, [k]: v.trim() === '' || isNaN(Number(v)) ? null : Number(v) })

  return (
    <>
      <PageHeader title="Settings" description="Your wallet and research preferences. Preferences are saved in this browser." />

      <div className="settings">
        <section className="card">
          <h2>Wallet</h2>
          {w.address ? (
            <dl className="kv kv--wide">
              <div><dt>Address</dt><dd className="mono small">{w.address}</dd></div>
              <div><dt>Network</dt><dd>{chainName(w.chainId) ?? 'Unknown'}</dd></div>
              <div><dt>Access</dt><dd>Read-only — no transactions are ever requested</dd></div>
            </dl>
          ) : (
            <p className="muted">No wallet connected.</p>
          )}
          {w.address ? (
            <button className="btn btn--light" type="button" onClick={disconnectWallet}>Disconnect</button>
          ) : (
            <button className="btn btn--dark" type="button" onClick={connectWallet}>Connect Wallet</button>
          )}
          {!w.available && !w.address && (
            <p className="fine">No browser wallet detected. On mobile, open this site inside your wallet app’s browser.</p>
          )}
          {w.error && <p className="wallet__error">{w.error}</p>}
        </section>

        <section className="card">
          <h2>Risk preference</h2>
          <Segmented<RiskPref>
            name="Risk preference"
            value={prefs.risk}
            onChange={(risk) => setPrefs({ ...prefs, risk })}
            options={(Object.keys(RISK_LABEL) as RiskPref[]).map((v) => ({ value: v, label: RISK_LABEL[v] }))}
          />
          <p className="fine">Used to organise results and evaluate reports. It does not make any opportunity safe.</p>
        </section>

        <section className="card">
          <h2>Budget range (USD)</h2>
          <div className="field field--pair">
            <div>
              <input inputMode="decimal" placeholder="Min" aria-label="Minimum budget" value={prefs.budgetMin ?? ''} onChange={(e) => budget('budgetMin', e.target.value)} />
              <input inputMode="decimal" placeholder="Max" aria-label="Maximum budget" value={prefs.budgetMax ?? ''} onChange={(e) => budget('budgetMax', e.target.value)} />
            </div>
          </div>
          <p className="fine">Reports compare your budget with pool size. Your budget is stored only in this browser.</p>
        </section>

        <section className="card card--span">
          <h2>
            Preferred networks{' '}
            {prefs.networks.length > 0 && <Badge>{prefs.networks.length} selected</Badge>}
          </h2>
          <div className="net-grid">
            {networks.map((n) => (
              <Check
                key={n}
                checked={prefs.networks.includes(n)}
                onChange={(on) =>
                  setPrefs({ ...prefs, networks: on ? [...prefs.networks, n] : prefs.networks.filter((x) => x !== n) })
                }
              >
                <Chain chain={n} size={18} />
              </Check>
            ))}
          </div>
          <p className="fine">Ordered by total TVL in DefiLlama data.</p>
        </section>

        <div className="settings__reset">
          <button className="link-btn" type="button" onClick={() => setPrefs(DEFAULT_PREFS)}>
            Reset preferences
          </button>
        </div>
      </div>
    </>
  )
}
