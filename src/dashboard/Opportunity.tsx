import { Link, useParams } from 'react-router-dom'
import {
  ChartPoint,
  fmtPct,
  fmtUsd,
  loadPools,
  prettyProject,
  SOURCE,
  timeAgo,
  useNow,
  usePoolChart,
  usePoolsData,
  useProtocol,
} from './data'
import { Badge, DotLoader, ErrorBox, Missing, ProtocolLogo } from './ui'
import { CompareToggle, WatchButton } from './actions'
import { useReports } from './store'

function ApyChart({ points }: { points: ChartPoint[] }) {
  const pts = points.slice(-120)
  const vals = pts.map((p) => p.apy as number)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const W = 600
  const H = 140
  const path = pts
    .map((p, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1 || 1)) * W).toFixed(1)} ${(H - (((p.apy as number) - min) / span) * (H - 16) - 8).toFixed(1)}`)
    .join(' ')
  const first = new Date(pts[0].timestamp)
  const last = new Date(pts[pts.length - 1].timestamp)
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="APY history">
        <path d={`${path} L${W} ${H} L0 ${H} Z`} fill="var(--ink)" opacity="0.05" />
        <path d={path} fill="none" stroke="var(--ink)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption>
        <span>{first.toLocaleDateString()}</span>
        <span>
          Range {fmtPct(min)} – {fmtPct(max)} · {pts.length} daily points
        </span>
        <span>{last.toLocaleDateString()}</span>
      </figcaption>
    </figure>
  )
}

export default function Opportunity() {
  const { poolId } = useParams()
  const data = usePoolsData()
  const now = useNow()
  const pool = data.status === 'ready' ? data.byId.get(poolId!) : undefined
  const protocol = useProtocol(pool?.project)
  const chart = usePoolChart(pool?.pool)
  const [reports] = useReports()
  const latest = reports.filter((r) => r.opportunity.pool === poolId).sort((a, b) => b.createdAt - a.createdAt)[0]

  if (data.status === 'loading' || data.status === 'idle') return <DotLoader label="Loading opportunity…" />
  if (data.status === 'error')
    return <ErrorBox title="Live data unavailable" message={data.message} onRetry={() => loadPools(true)} />
  if (!pool)
    return (
      <ErrorBox
        title="Opportunity not found"
        message="This pool is not in DefiLlama's current data. It may have been removed or renamed."
      />
    )

  const info = protocol.status === 'ready' ? protocol.data : null
  const audits = info?.audit_links ?? []
  const missing = [
    'Available liquidity beyond TVL',
    'Fees',
    'Withdrawal conditions and lock-ups',
    ...(protocol.status === 'error' ? ['Protocol details (request failed)'] : []),
    ...(info && info.audits == null && !audits.length ? ['Audit information'] : []),
    ...(chart.status === 'error' ? ['APY history (request failed)'] : []),
  ]

  return (
    <div className="detail">
      <Link className="back" to="/app/discover">
        ← Back to Discover
      </Link>

      <header className="detail__head">
        <ProtocolLogo slug={pool.project} size={52} />
        <div>
          <h1>{info?.name ?? prettyProject(pool.project)}</h1>
          <p>
            {pool.symbol} on {pool.chain}
            {pool.poolMeta && ` · ${pool.poolMeta}`}
          </p>
        </div>
        <div className="detail__actions">
          <Link className="btn btn--accent" to={`/app/research/${pool.pool}`}>
            <span className="btn__icon" aria-hidden="true" />
            Research This Opportunity
          </Link>
          <WatchButton pool={pool} fetchedAt={data.fetchedAt} />
          <CompareToggle poolId={pool.pool} />
        </div>
      </header>

      {latest && (
        <p className="notice notice--info">
          You researched this opportunity {timeAgo(latest.createdAt, now)}.{' '}
          <Link to={`/app/report/${latest.id}`}>Open the report</Link>
        </p>
      )}

      <div className="detail__grid">
        <section className="card">
          <h2>1. Protocol</h2>
          {protocol.status === 'loading' && <DotLoader label="Loading protocol details…" />}
          {protocol.status === 'error' && <Missing>Protocol details could not be loaded ({protocol.message})</Missing>}
          {info && (
            <dl className="kv kv--wide">
              <div>
                <dt>Name</dt>
                <dd>{info.name}</dd>
              </div>
              <div>
                <dt>Category</dt>
                <dd>{info.category ?? <Missing />}</dd>
              </div>
              <div>
                <dt>Website</dt>
                <dd>
                  {info.url ? (
                    <a href={info.url} target="_blank" rel="noreferrer noopener">
                      {info.url.replace(/^https?:\/\//, '')}
                    </a>
                  ) : (
                    <Missing />
                  )}
                </dd>
              </div>
              {info.description && <p className="desc">{info.description}</p>}
            </dl>
          )}
        </section>

        <section className="card">
          <h2>2. Network and assets</h2>
          <dl className="kv kv--wide">
            <div>
              <dt>Network</dt>
              <dd>{pool.chain}</dd>
            </div>
            <div>
              <dt>Asset(s)</dt>
              <dd>{pool.symbol}</dd>
            </div>
            <div>
              <dt>Exposure</dt>
              <dd>{pool.exposure === 'multi' ? 'Multiple assets' : 'Single asset'}</dd>
            </div>
            <div>
              <dt>Stablecoin pool</dt>
              <dd>{pool.stablecoin ? 'Yes' : 'No'}</dd>
            </div>
            <div>
              <dt>Token addresses</dt>
              <dd className="mono small">
                {pool.underlyingTokens?.length ? pool.underlyingTokens.map((t) => <div key={t}>{t}</div>) : <Missing />}
              </dd>
            </div>
          </dl>
        </section>

        <section className="card card--span">
          <h2>3. APY and history</h2>
          <div className="stat-row">
            <div>
              <span className="dot-num dot-num--md">{fmtPct(pool.apy)}</span>
              <span className="k">Current APY</span>
            </div>
            <div>
              <span className="num">{fmtPct(pool.apyBase)}</span>
              <span className="k">Base</span>
            </div>
            <div>
              <span className="num">{fmtPct(pool.apyReward)}</span>
              <span className="k">Rewards</span>
            </div>
            <div>
              <span className="num">{fmtPct(pool.apyMean30d)}</span>
              <span className="k">30-day average</span>
            </div>
            <div>
              <span className="num">{pool.apyPct7D == null ? '—' : `${pool.apyPct7D > 0 ? '+' : ''}${pool.apyPct7D.toFixed(2)} pts`}</span>
              <span className="k">7-day change</span>
            </div>
          </div>
          {chart.status === 'loading' && <DotLoader label="Loading APY history…" />}
          {chart.status === 'error' && <Missing>APY history could not be loaded ({chart.message})</Missing>}
          {chart.status === 'ready' && (chart.data.length > 1 ? <ApyChart points={chart.data} /> : <Missing>No APY history available</Missing>)}
          <p className="fine">Past APY does not predict future returns and is not a measure of safety.</p>
        </section>

        <section className="card">
          <h2>4. TVL and liquidity</h2>
          <dl className="kv kv--wide">
            <div>
              <dt>TVL</dt>
              <dd>{fmtUsd(pool.tvlUsd)}</dd>
            </div>
            <div>
              <dt>Available liquidity</dt>
              <dd>
                <Missing />
              </dd>
            </div>
          </dl>
          <p className="fine">TVL is the value deposited, not the amount that can be withdrawn at once.</p>
        </section>

        <section className="card">
          <h2>5–6. Fees and withdrawal</h2>
          <dl className="kv kv--wide">
            <div>
              <dt>Fees</dt>
              <dd>
                <Missing />
              </dd>
            </div>
            <div>
              <dt>Withdrawal conditions</dt>
              <dd>
                <Missing />
              </dd>
            </div>
            <div>
              <dt>Impermanent-loss exposure</dt>
              <dd>{pool.ilRisk === 'yes' ? 'Yes (per DefiLlama)' : pool.ilRisk === 'no' ? 'No (per DefiLlama)' : <Missing />}</dd>
            </div>
          </dl>
        </section>

        <section className="card">
          <h2>7. Security and audits</h2>
          {protocol.status === 'loading' && <DotLoader label="Loading…" />}
          {protocol.status === 'error' && <Missing>Could not load audit information</Missing>}
          {info && (
            <>
              <dl className="kv kv--wide">
                <div>
                  <dt>Audits listed</dt>
                  <dd>{info.audits != null ? info.audits : <Missing />}</dd>
                </div>
              </dl>
              {info.audit_note && <p className="fine">{info.audit_note}</p>}
              {audits.length > 0 ? (
                <ul className="links">
                  {audits.map((l) => (
                    <li key={l}>
                      <a href={l} target="_blank" rel="noreferrer noopener">
                        {l.replace(/^https?:\/\//, '').slice(0, 60)}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <Missing>No audit links listed</Missing>
              )}
              <p className="fine">Claims listed by DefiLlama; not independently verified. An audit does not guarantee safety.</p>
            </>
          )}
        </section>

        <section className="card">
          <h2>8. Sources and timestamps</h2>
          <ul className="sources">
            <li>
              <Badge tone="live">{SOURCE}</Badge> Pool data — fetched {timeAgo(data.fetchedAt, now)}
            </li>
            <li>
              <Badge tone="live">{SOURCE}</Badge> Protocol details —{' '}
              {protocol.status === 'ready' ? `fetched ${timeAgo(protocol.fetchedAt, now)}` : protocol.status === 'loading' ? 'loading' : 'failed'}
            </li>
            <li>
              <Badge tone="live">{SOURCE}</Badge> APY history —{' '}
              {chart.status === 'ready' ? `fetched ${timeAgo(chart.fetchedAt, now)}` : chart.status === 'loading' ? 'loading' : 'failed'}
            </li>
          </ul>
          <p className="fine">“Fetched” is when this app loaded the data, not when DefiLlama last updated it.</p>
        </section>

        <section className="card card--warn">
          <h2>9. Missing or unavailable</h2>
          <ul className="missing-list">
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <Link className="btn btn--dark btn--sm" to={`/app/research/${pool.pool}`}>
            Request more through Telegraph
          </Link>
        </section>
      </div>
    </div>
  )
}
