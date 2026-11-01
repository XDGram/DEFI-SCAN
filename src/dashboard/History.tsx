import { useState } from 'react'
import { Link } from 'react-router-dom'
import { prettyProject } from './data'
import { ALIGNMENT_LABEL, STATUS_LABEL, useReports } from './store'
import { Badge, ConfirmDialog, Empty, PageHeader } from './ui'

export default function History() {
  const [reports, setReports] = useReports()
  const sorted = [...reports].sort((a, b) => b.createdAt - a.createdAt)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const pending = reports.find((r) => r.id === pendingId)

  return (
    <>
      <PageHeader title="Research History" description="Previous research requests and their reports. Saved in this browser." />
      {!sorted.length ? (
        <Empty title="No research yet">
          Open an opportunity in <Link to="/app/discover">Discover</Link> and choose <strong>Research This Opportunity</strong>.
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="list list--cards">
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
                  <td data-label="Opportunity">
                    <strong>{prettyProject(r.opportunity.project)}</strong>
                    <span className="muted"> · {r.opportunity.symbol} · {r.opportunity.chain}</span>
                  </td>
                  <td data-label="Date">{new Date(r.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td data-label="Status">
                    <Badge tone={r.status === 'telegraph-complete' ? 'live' : 'warn'}>{STATUS_LABEL[r.status]}</Badge>
                  </td>
                  <td data-label="Telegraph reference" className="mono small">{r.telegraphRef ?? 'None — not submitted'}</td>
                  <td data-label="Report">
                    <Link to={`/app/report/${r.id}`}>Open · {ALIGNMENT_LABEL[r.alignment]}</Link>
                  </td>
                  <td className="cell-actions">
                    <button
                      className="btn btn--ghost btn--sm"
                      type="button"
                      onClick={() => setPendingId(r.id)}
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
      <ConfirmDialog
        open={!!pending}
        title="Delete this report?"
        confirmLabel="Delete report"
        onCancel={() => setPendingId(null)}
        onConfirm={() => {
          setReports(reports.filter((x) => x.id !== pendingId))
          setPendingId(null)
        }}
      >
        {pending && `The report for ${prettyProject(pending.opportunity.project)} (${pending.opportunity.symbol}) will be removed. This can’t be undone.`}
      </ConfirmDialog>
    </>
  )
}
