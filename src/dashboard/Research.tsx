import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fmtPct, fmtUsd, loadPools, prettyProject, usePoolsData, useProtocol } from './data'
import { usePrefs, useReports } from './store'
import { buildReport, RESEARCH_TOPICS } from './report'
import { Badge, Check, DotLoader, ErrorBox, ProtocolLogo } from './ui'

export const TELEGRAPH_CONNECTED = false

function Step({ n, title, state, children }: { n: number; title: string; state: 'active' | 'blocked' | 'idle'; children: React.ReactNode }) {
  return (
    <section className={`step-card step-card--${state}`}>
      <header>
        <span className="step-card__n">{String(n).padStart(2, '0')}</span>
        <h2>{title}</h2>
      </header>
      <div className="step-card__body">{children}</div>
    </section>
  )
}

export default function Research() {
  const { poolId } = useParams()
  const data = usePoolsData()
  const pool = data.status === 'ready' ? data.byId.get(poolId!) : undefined
  const protocol = useProtocol(pool?.project)
  const [prefs] = usePrefs()
  const [, setReports] = useReports()
  const [topics, setTopics] = useState<string[]>(RESEARCH_TOPICS.map((t) => t.id))
  const navigate = useNavigate()

  if (data.status === 'loading' || data.status === 'idle') return <DotLoader label="Loading opportunity…" />
  if (data.status === 'error') return <ErrorBox title="Live data unavailable" message={data.message} onRetry={() => loadPools(true)} />
  if (!pool) return <ErrorBox title="Opportunity not found" message="This pool is not in DefiLlama's current data." />

  const toggle = (id: string, on: boolean) => setTopics((t) => (on ? [...t, id] : t.filter((x) => x !== id)))

  const createPublicReport = () => {
    const report = buildReport({
      pool,
      fetchedAt: data.fetchedAt,
      protocol: {
        info: protocol.status === 'ready' ? protocol.data : null,
        fetchedAt: protocol.status === 'ready' ? protocol.fetchedAt : null,
        error: protocol.status === 'error' ? protocol.message : null,
      },
      prefs,
      topics,
    })
    setReports((r) => [report, ...r])
    navigate(`/app/report/${report.id}`)
  }

  return (
    <div className="research">
      <Link className="back" to={`/app/opportunity/${pool.pool}`}>
        ← Back to opportunity
      </Link>
      <header className="page-head">
        <div>
          <h1>Research request</h1>
          <p>Request additional intelligence about this opportunity through Telegraph.</p>
        </div>
        <Badge tone="warn">Telegraph integration not connected</Badge>
      </header>

      <div className="steps-flow">
        <Step n={1} title="Research request" state="active">
          <div className="req-opp">
            <ProtocolLogo slug={pool.project} size={40} />
            <div>
              <strong>{prettyProject(pool.project)}</strong>
              <p>
                {pool.symbol} · {pool.chain} · APY {fmtPct(pool.apy)} · TVL {fmtUsd(pool.tvlUsd)}
              </p>
            </div>
          </div>
          <h3 className="sub">What will be investigated</h3>
          <div className="topic-grid">
            {RESEARCH_TOPICS.map((t) => (
              <Check key={t.id} checked={topics.includes(t.id)} onChange={(v) => toggle(t.id, v)}>
                {t.label}
              </Check>
            ))}
          </div>
          <dl className="kv kv--wide">
            <div>
              <dt>Intelligence provider</dt>
              <dd>
                <span className="missing">None available — Telegraph integration not connected</span>
              </dd>
            </div>
            <div>
              <dt>Expected cost</dt>
              <dd>
                <span className="missing">Not supplied — no provider has quoted a price</span>
              </dd>
            </div>
            <div>
              <dt>Request details</dt>
              <dd className="mono small">
                pool {pool.pool.slice(0, 8)}… · {pool.chain} · {topics.length} topic{topics.length === 1 ? '' : 's'}
              </dd>
            </div>
          </dl>
        </Step>

        <Step n={2} title="Confirm cost" state="blocked">
          <p>Before any purchase, the provider's actual price will be shown here and you will need to confirm it.</p>
          <button className="btn btn--dark" type="button" disabled title="Telegraph integration not connected">
            Confirm and purchase
          </button>
          <p className="fine">No price is shown because no provider has supplied one. Nothing has been purchased.</p>
        </Step>

        <Step n={3} title="Telegraph request" state="idle">
          <div className="status-line">
            <span className="status-dot status-dot--idle" aria-hidden="true" />
            Not submitted
          </div>
          <p className="fine">
            Real request status from Telegraph will appear here once the integration is connected.{' '}
            <Link to="/app/preview/payment-states">Preview the possible states (simulated)</Link>
          </p>
        </Step>

        <Step n={4} title="Research result" state="idle">
          <p>No intelligence has been returned.</p>
        </Step>
      </div>

      <section className="card card--dark">
        <h2>Continue with public data only</h2>
        <p>
          You can create a report from DefiLlama data and your preferences now. It will be clearly marked as containing
          no Telegraph intelligence, and missing information will be listed.
        </p>
        <button
          className="btn btn--light"
          type="button"
          onClick={createPublicReport}
          disabled={protocol.status === 'loading' || !topics.length}
        >
          {protocol.status === 'loading' ? 'Loading protocol details…' : 'Create public-data report'}
        </button>
      </section>
    </div>
  )
}
