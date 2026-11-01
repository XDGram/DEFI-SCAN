import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fmtPct, fmtUsd, loadPools, prettyProject, SOURCE, timeAgo, useNow, usePoolsData } from './data'
import { usePrefs, useStored } from './store'
import { Badge, DotLoader, Empty, ErrorBox, Missing, PageHeader, ProtocolLogo, Switch } from './ui'
import { CompareToggle, WatchButton } from './actions'

interface Filters {
  protocol: string
  asset: string
  network: string
  apyMin: string
  apyMax: string
  tvlMin: string
  tvlMax: string
  stableOnly: boolean
  noIl: boolean
  preferMine: boolean
  sort: 'apy' | 'tvl'
}

const DEFAULT_FILTERS: Filters = {
  protocol: '',
  asset: '',
  network: '',
  apyMin: '',
  apyMax: '',
  tvlMin: '1000000',
  tvlMax: '',
  stableOnly: false,
  noIl: false,
  preferMine: true,
  sort: 'tvl',
}

const TVL_OPTIONS = [
  { v: '', l: 'Any' },
  { v: '100000', l: '$100K' },
  { v: '1000000', l: '$1M' },
  { v: '10000000', l: '$10M' },
  { v: '100000000', l: '$100M' },
  { v: '1000000000', l: '$1B' },
]

const PAGE = 24

const num = (s: string) => (s.trim() === '' || isNaN(Number(s)) ? null : Number(s))

export default function Discover() {
  const data = usePoolsData()
  const [prefs] = usePrefs()
  const [f, setF] = useStored<Filters>('discover-filters', DEFAULT_FILTERS)
  const [shown, setShown] = useState(PAGE)
  const now = useNow()
  const upd = (patch: Partial<Filters>) => {
    setF({ ...f, ...patch })
    setShown(PAGE)
  }

  const networks = useMemo(() => {
    if (data.status !== 'ready') return []
    const counts = new Map<string, number>()
    data.pools.forEach((p) => counts.set(p.chain, (counts.get(p.chain) ?? 0) + 1))
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)
  }, [data])

  const results = useMemo(() => {
    if (data.status !== 'ready') return []
    const proto = f.protocol.trim().toLowerCase()
    const asset = f.asset.trim().toLowerCase()
    const [aMin, aMax, tMin, tMax] = [num(f.apyMin), num(f.apyMax), num(f.tvlMin), num(f.tvlMax)]
    const mine = new Set(prefs.networks)
    const list = data.pools.filter((p) => {
      if (proto && !p.project.toLowerCase().includes(proto) && !prettyProject(p.project).toLowerCase().includes(proto)) return false
      if (asset && !p.symbol.toLowerCase().includes(asset)) return false
      if (f.network && p.chain !== f.network) return false
      if (aMin != null && (p.apy == null || p.apy < aMin)) return false
      if (aMax != null && (p.apy == null || p.apy > aMax)) return false
      if (tMin != null && p.tvlUsd < tMin) return false
      if (tMax != null && p.tvlUsd > tMax) return false
      if (f.stableOnly && !p.stablecoin) return false
      if (f.noIl && p.ilRisk !== 'no') return false
      return true
    })
    const key = f.sort === 'apy' ? (p: (typeof list)[0]) => p.apy ?? -Infinity : (p: (typeof list)[0]) => p.tvlUsd
    list.sort((a, b) => {
      if (f.preferMine && mine.size) {
        const d = Number(mine.has(b.chain)) - Number(mine.has(a.chain))
        if (d) return d
      }
      return key(b) - key(a)
    })
    return list
  }, [data, f, prefs.networks])

  const activeCount =
    [f.protocol, f.asset, f.network, f.apyMin, f.apyMax, f.tvlMax].filter(Boolean).length +
    Number(f.tvlMin !== DEFAULT_FILTERS.tvlMin) +
    Number(f.stableOnly) +
    Number(f.noIl)

  return (
    <>
      <PageHeader
        title="Discover Opportunities"
        description="Explore DeFi yield opportunities across supported networks."
        actions={
          data.status === 'ready' && (
            <span className="fetched">
              <Badge tone="live">Live</Badge> {SOURCE} · Fetched {timeAgo(data.fetchedAt, now)}
              <button className="link-btn" type="button" onClick={() => loadPools(true)}>
                Refresh
              </button>
            </span>
          )
        }
      />

      <p className="notice">
        <strong>APY is not a measure of safety.</strong> Rates are variable, can change at any time and may depend on
        reward tokens. Review the details and research before deciding.
      </p>

      <section className="filters" aria-label="Search and filters">
        <div className="filters__grid">
          <label className="field">
            <span>Protocol</span>
            <input type="search" placeholder="e.g. aave" value={f.protocol} onChange={(e) => upd({ protocol: e.target.value })} />
          </label>
          <label className="field">
            <span>Asset</span>
            <input type="search" placeholder="e.g. USDC" value={f.asset} onChange={(e) => upd({ asset: e.target.value })} />
          </label>
          <label className="field">
            <span>Network</span>
            <select value={f.network} onChange={(e) => upd({ network: e.target.value })}>
              <option value="">All networks</option>
              {networks.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <div className="field field--pair">
            <span>APY %</span>
            <div>
              <input inputMode="decimal" placeholder="Min" aria-label="Minimum APY" value={f.apyMin} onChange={(e) => upd({ apyMin: e.target.value })} />
              <input inputMode="decimal" placeholder="Max" aria-label="Maximum APY" value={f.apyMax} onChange={(e) => upd({ apyMax: e.target.value })} />
            </div>
          </div>
          <div className="field field--pair">
            <span>TVL</span>
            <div>
              <select aria-label="Minimum TVL" value={f.tvlMin} onChange={(e) => upd({ tvlMin: e.target.value })}>
                {TVL_OPTIONS.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.v ? `≥ ${o.l}` : 'Min: any'}
                  </option>
                ))}
              </select>
              <select aria-label="Maximum TVL" value={f.tvlMax} onChange={(e) => upd({ tvlMax: e.target.value })}>
                {TVL_OPTIONS.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.v ? `≤ ${o.l}` : 'Max: any'}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label className="field">
            <span>Withdrawal conditions</span>
            <select disabled title="Withdrawal conditions are not provided by current data sources">
              <option>Not available from current sources</option>
            </select>
          </label>
          <label className="field">
            <span>Sort by</span>
            <select value={f.sort} onChange={(e) => upd({ sort: e.target.value as Filters['sort'] })}>
              <option value="apy">Highest APY</option>
              <option value="tvl">Highest TVL</option>
              <option disabled>Lowest fees — not available from current sources</option>
              <option disabled>Recently updated — no per-pool update time available</option>
            </select>
          </label>
        </div>
        <div className="filters__risk">
          <span className="filters__label">Risk preference filters</span>
          <Switch checked={f.stableOnly} onChange={(v) => upd({ stableOnly: v })} label="Stablecoin pools only" />
          <Switch
            checked={f.noIl}
            onChange={(v) => upd({ noIl: v })}
            label="No impermanent-loss exposure (per DefiLlama)"
          />
          <Switch
            checked={f.preferMine && prefs.networks.length > 0}
            disabled={!prefs.networks.length}
            hint={prefs.networks.length ? undefined : 'Set preferred networks in Settings'}
            onChange={(v) => upd({ preferMine: v })}
            label={prefs.networks.length ? 'Show my preferred networks first' : 'Preferred networks first (set in Settings)'}
          />
          {activeCount > 0 && (
            <button className="link-btn" type="button" onClick={() => upd(DEFAULT_FILTERS)}>
              Reset filters ({activeCount})
            </button>
          )}
        </div>
        <p className="filters__hint">These filters describe pool attributes. They do not make an opportunity safe.</p>
      </section>

      {(data.status === 'loading' || data.status === 'idle') && <DotLoader label="Loading live opportunities from DefiLlama…" />}
      {data.status === 'error' && (
        <ErrorBox
          title="Live data unavailable"
          message={`Could not load opportunities from DefiLlama (${data.message}). Nothing is shown rather than estimated figures.`}
          onRetry={() => loadPools(true)}
        />
      )}

      {data.status === 'ready' && (
        <>
          <p className="result-count">
            {results.length.toLocaleString()} opportunities match
            {results.length > shown && ` · showing ${shown}`}
          </p>
          {results.length === 0 ? (
            <Empty title="No opportunities match these filters">Try widening the APY or TVL range.</Empty>
          ) : (
            <div className="opp-list">
              {results.slice(0, shown).map((p) => (
                <article className="opp-card" key={p.pool}>
                  <div className="opp-card__head">
                    <ProtocolLogo slug={p.project} />
                    <div className="opp-card__id">
                      <h3>{prettyProject(p.project)}</h3>
                      <p>
                        {p.symbol}
                        {p.poolMeta && <span className="muted"> · {p.poolMeta}</span>}
                      </p>
                    </div>
                    <Badge>{p.chain}</Badge>
                  </div>
                  <div className="opp-card__nums">
                    <div>
                      <span className="dot-num dot-num--md">{fmtPct(p.apy)}</span>
                      <span className="k">
                        APY{p.apyReward ? ` · ${fmtPct(p.apyReward)} from rewards` : ''}
                      </span>
                    </div>
                    <div>
                      <span className="num">{fmtUsd(p.tvlUsd)}</span>
                      <span className="k">TVL</span>
                    </div>
                  </div>
                  <dl className="kv">
                    <div>
                      <dt>Liquidity</dt>
                      <dd>
                        <Missing />
                      </dd>
                    </div>
                    <div>
                      <dt>Fees</dt>
                      <dd>
                        <Missing />
                      </dd>
                    </div>
                    <div>
                      <dt>Withdrawal</dt>
                      <dd>
                        <Missing />
                      </dd>
                    </div>
                    <div>
                      <dt>Source</dt>
                      <dd>{SOURCE}</dd>
                    </div>
                    <div>
                      <dt>Fetched</dt>
                      <dd>{timeAgo(data.fetchedAt, now)}</dd>
                    </div>
                  </dl>
                  <div className="opp-card__actions">
                    <Link className="btn btn--dark btn--sm" to={`/app/opportunity/${p.pool}`}>
                      View Details
                    </Link>
                    <WatchButton pool={p} fetchedAt={data.fetchedAt} compact />
                    <CompareToggle poolId={p.pool} />
                  </div>
                </article>
              ))}
            </div>
          )}
          {results.length > shown && (
            <div className="more">
              <button className="btn btn--light" type="button" onClick={() => setShown((s) => s + PAGE)}>
                Show more
              </button>
            </div>
          )}
        </>
      )}
    </>
  )
}
