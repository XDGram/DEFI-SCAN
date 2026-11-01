import { Link, useParams } from 'react-router-dom'
import { fmtUsd, prettyProject, SOURCE } from './data'
import { ALIGNMENT_LABEL, RISK_LABEL, STATUS_LABEL, useReports } from './store'
import { RESEARCH_TOPICS } from './report'
import { Badge, Chain, Empty, Missing, Pct, ProtocolLogo } from './ui'

const fmtDate = (ts: number) => new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export default function Report() {
  const { reportId } = useParams()
  const [reports] = useReports()
  const r = reports.find((x) => x.id === reportId)

  if (!r)
    return (
      <Empty title="Report not found">
        Reports are saved in this browser. <Link to="/app/history">View research history</Link>
      </Empty>
    )

  const o = r.opportunity
  const tone = r.alignment === 'matches' ? 'live' : r.alignment === 'mismatch' ? 'warn' : r.alignment === 'careful' ? 'info' : 'neutral'
  const prefs = r.preferences

  return (
    <article className="report">
      <Link className="back" to="/app/history">
        ← Research history
      </Link>
      <header className="report__head">
        <ProtocolLogo slug={o.project} size={48} />
        <div>
          <p className="eyebrow">Research report · {fmtDate(r.createdAt)}</p>
          <h1>
            {r.protocol.name ?? prettyProject(o.project)} — {o.symbol}
          </h1>
          <Badge tone={r.status === 'telegraph-complete' ? 'live' : 'warn'}>{STATUS_LABEL[r.status]}</Badge>
        </div>
        <div className="detail__actions">
          <Link className="btn btn--light btn--sm" to={`/app/opportunity/${o.pool}`}>
            Open opportunity
          </Link>
          <button className="btn btn--light btn--sm" type="button" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </header>

      <section className="report__verdict">
        <span className="eyebrow">E. Preference alignment</span>
        <div className={`verdict verdict--${tone}`}>{ALIGNMENT_LABEL[r.alignment]}</div>
        <ul>
          {r.alignmentReasons.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <p className="fine">
          Based on preferences at the time of the report — risk: {prefs.risk ? RISK_LABEL[prefs.risk] : 'not set'}; networks:{' '}
          {prefs.networks.length ? prefs.networks.join(', ') : 'not set'}; budget:{' '}
          {prefs.budgetMin != null || prefs.budgetMax != null
            ? `${fmtUsd(prefs.budgetMin ?? 0)} – ${prefs.budgetMax != null ? fmtUsd(prefs.budgetMax) : 'no max'}`
            : 'not set'}
          . This is not a guarantee of safety, suitability or returns.
        </p>
      </section>

      <div className="report__grid">
        <section className="card">
          <h2>A. Opportunity overview</h2>
          <dl className="kv kv--wide">
            <div><dt>Protocol</dt><dd>{r.protocol.name ?? prettyProject(o.project)}{r.protocol.category && ` · ${r.protocol.category}`}</dd></div>
            <div><dt>Network</dt><dd><Chain chain={o.chain} /></dd></div>
            <div><dt>Assets</dt><dd>{o.symbol}{o.poolMeta && ` · ${o.poolMeta}`}</dd></div>
            <div><dt>APY</dt><dd><Pct value={o.apy} /></dd></div>
            <div><dt>TVL</dt><dd>{fmtUsd(o.tvlUsd)}</dd></div>
          </dl>
        </section>

        <section className="card">
          <h2>B. Market analysis</h2>
          <dl className="kv kv--wide">
            <div><dt>Base APY</dt><dd><Pct value={o.apyBase} /></dd></div>
            <div><dt>Reward APY</dt><dd><Pct value={o.apyReward} /></dd></div>
            <div><dt>30-day average</dt><dd><Pct value={o.apyMean30d} /></dd></div>
            <div><dt>7-day change</dt><dd>{o.apyPct7D == null ? <span className="na">Not reported</span> : `${o.apyPct7D.toFixed(2)} pts`}</dd></div>
            <div><dt>Liquidity</dt><dd><Missing /></dd></div>
            <div><dt>Fees</dt><dd><Missing /></dd></div>
            <div><dt>Withdrawal</dt><dd><Missing /></dd></div>
          </dl>
          {o.apyReward != null && o.apyBase != null && o.apyReward > o.apyBase && (
            <p className="fine">Derived: most of the yield comes from reward tokens, whose value and emissions can change.</p>
          )}
        </section>

        <section className="card card--span">
          <h2>C. Intelligence findings</h2>
          {r.status === 'public-data-only' ? (
            <>
              <Missing>No Telegraph intelligence — the integration is not connected, so nothing was purchased.</Missing>
              <p className="fine">
                Requested topics: {r.topics.map((t) => RESEARCH_TOPICS.find((x) => x.id === t)?.label ?? t).join('; ')}.
              </p>
            </>
          ) : (
            <p>Telegraph findings will be shown here with provider and evidence.</p>
          )}
        </section>

        <section className="card">
          <h2>D. Risk considerations</h2>
          <dl className="kv kv--wide">
            <div>
              <dt>Audits</dt>
              <dd>{r.protocol.audits != null ? `${r.protocol.audits} listed (claim, unverified)` : <Missing />}</dd>
            </div>
            <div><dt>Contract and protocol concerns</dt><dd><Missing>Not assessed — requires Telegraph intelligence</Missing></dd></div>
            <div><dt>Liquidity concerns</dt><dd><Missing>Available liquidity unknown</Missing></dd></div>
            <div><dt>Impermanent loss</dt><dd>{o.ilRisk === 'yes' ? 'Exposure flagged by DefiLlama' : o.ilRisk === 'no' ? 'Not flagged by DefiLlama' : <Missing />}</dd></div>
            <div><dt>Stablecoin pool</dt><dd>{o.stablecoin ? 'Yes' : 'No'}</dd></div>
          </dl>
          {r.protocol.auditLinks.length > 0 && (
            <ul className="links">
              {r.protocol.auditLinks.map((l) => (
                <li key={l}><a href={l} target="_blank" rel="noreferrer noopener">{l.replace(/^https?:\/\//, '').slice(0, 60)}</a></li>
              ))}
            </ul>
          )}
        </section>

        <section className="card card--warn">
          <h2>Missing information</h2>
          <ul className="missing-list">
            {r.missing.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </section>

        <section className="card card--span">
          <h2>F. Sources and limitations</h2>
          <ul className="sources">
            <li><Badge tone="live">{SOURCE}</Badge> Pool data — fetched {fmtDate(o.fetchedAt)}</li>
            <li>
              <Badge tone="live">{SOURCE}</Badge> Protocol details —{' '}
              {r.protocol.fetchedAt ? `fetched ${fmtDate(r.protocol.fetchedAt)}` : `unavailable${r.protocol.error ? ` (${r.protocol.error})` : ''}`}
            </li>
            <li><Badge>Telegraph</Badge> Request reference — {r.telegraphRef ?? 'none (not submitted)'}</li>
          </ul>
          <ul className="limits">
            <li>“Fetched” times are when this app loaded the data, not when the source last updated it.</li>
            <li>Figures are a snapshot from the time of the report and may have changed.</li>
            <li>Lines marked “Derived” are calculations by this app, not data from a source.</li>
            <li>Audit counts are claims listed by DefiLlama and were not verified.</li>
            <li>This report is research, not financial advice, and does not guarantee safety, suitability or returns.</li>
          </ul>
        </section>
      </div>
    </article>
  )
}
