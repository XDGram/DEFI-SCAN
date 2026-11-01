import { Link } from 'react-router-dom'
import { fmtUsd, prettyProject, timeAgo, useNow, usePoolsData } from './data'
import { STATUS_LABEL, useReports, useWatchlist } from './store'
import { Badge, Chain, Empty, PageHeader, Pct, ProtocolLogo } from './ui'

export default function Watchlist() {
  const [list, setList] = useWatchlist()
  const [reports] = useReports()
  const data = usePoolsData()
  const now = useNow()

  return (
    <>
      <PageHeader title="Watchlist" description="Opportunities you saved to revisit. Saved in this browser." />
      {!list.length ? (
        <Empty title="Your watchlist is empty">
          Use <strong>Add to Watchlist</strong> on any opportunity in <Link to="/app/discover">Discover</Link>.
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="list list--cards">
            <thead>
              <tr>
                <th>Opportunity</th>
                <th>Network</th>
                <th>APY</th>
                <th>TVL</th>
                <th>Last fetched</th>
                <th>Research</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {list.map((s) => {
                const live = data.status === 'ready' ? data.byId.get(s.pool) : undefined
                const apy = live ? live.apy : s.apy
                const tvl = live ? live.tvlUsd : s.tvlUsd
                const fetched = live && data.status === 'ready' ? data.fetchedAt : s.fetchedAt
                const r = reports.filter((x) => x.opportunity.pool === s.pool).sort((a, b) => b.createdAt - a.createdAt)[0]
                return (
                  <tr key={s.pool}>
                    <td data-label="Opportunity">
                      <div className="cell-id">
                        <ProtocolLogo slug={s.project} size={28} />
                        <div>
                          <strong>{prettyProject(s.project)}</strong>
                          <span>{s.symbol}</span>
                        </div>
                      </div>
                    </td>
                    <td data-label="Network">
                      <Chain chain={s.chain} />
                    </td>
                    <td data-label="APY" className="num">
                      <Pct value={apy} />
                    </td>
                    <td data-label="TVL" className="num">{fmtUsd(tvl)}</td>
                    <td data-label="Last fetched">
                      {timeAgo(fetched, now)}
                      {!live && <Badge tone="warn">Saved snapshot</Badge>}
                    </td>
                    <td data-label="Research">{r ? <Link to={`/app/report/${r.id}`}>{STATUS_LABEL[r.status]}</Link> : <span className="muted">Not researched</span>}</td>
                    <td className="cell-actions">
                      <div className="row-actions">
                        <Link className="btn btn--light btn--sm" to={`/app/opportunity/${s.pool}`}>
                          Details
                        </Link>
                        <Link className="btn btn--dark btn--sm" to={`/app/research/${s.pool}`}>
                          Research
                        </Link>
                        <button
                          className="btn btn--ghost btn--sm"
                          type="button"
                          onClick={() => setList(list.filter((x) => x.pool !== s.pool))}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
