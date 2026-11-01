import { Link } from 'react-router-dom'
import { prettyProject } from './data'
import { ALIGNMENT_LABEL, STATUS_LABEL, useReports } from './store'
import { Badge, Empty, PageHeader } from './ui'

export default function History() {
  const [reports, setReports] = useReports()
  const sorted = [...reports].sort((a, b) => b.createdAt - a.createdAt)

  return (
    <>
      <PageHeader title="Research History" description="Previous research requests and their reports. Saved in this browser." />
      {!sorted.length ? (
        <Empty title="No research yet">
          Open an opportunity in <Link to="/app/discover">Discover</Link> and choose <strong>Research This Opportunity</strong>.
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr>
                <th>Opportunity</th>
                <th>Date</th>
                <th>Status</th>
                <th>Telegraph reference</th>
                <th>Report</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{prettyProject(r.opportunity.project)}</strong>
                    <span className="muted"> · {r.opportunity.symbol} · {r.opportunity.chain}</span>
                  </td>
                  <td>{new Date(r.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td>
                    <Badge tone={r.status === 'telegraph-complete' ? 'live' : 'warn'}>{STATUS_LABEL[r.status]}</Badge>
                  </td>
                  <td className="mono small">{r.telegraphRef ?? '—'}</td>
                  <td>
                    <Link to={`/app/report/${r.id}`}>Open · {ALIGNMENT_LABEL[r.alignment]}</Link>
                  </td>
                  <td>
                    <button
                      className="btn btn--ghost btn--sm"
                      type="button"
                      onClick={() => setReports(reports.filter((x) => x.id !== r.id))}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
