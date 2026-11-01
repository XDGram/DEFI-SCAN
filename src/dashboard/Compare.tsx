import { Link } from 'react-router-dom'
import { ReactNode } from 'react'
import { fmtPct, fmtUsd, LlamaPool, prettyProject, timeAgo, useNow, usePoolsData } from './data'
import { ALIGNMENT_LABEL, ReportData, useCompare, useReports } from './store'
import { Chain, DotLoader, Empty, Missing, PageHeader, ProtocolLogo } from './ui'

export default function Compare() {
  const [ids, setIds] = useCompare()
  const data = usePoolsData()
  const [reports] = useReports()
  const now = useNow()

  if (!ids.length)
    return (
      <>
        <PageHeader title="Compare" description="Compare opportunities side by side across more than APY." />
        <Empty title="Nothing selected yet">
          Tick <strong>Compare</strong> on up to 4 opportunities in <Link to="/app/discover">Discover</Link>.
        </Empty>
      </>
    )
  if (data.status !== 'ready') return <DotLoader label="Loading live data…" />

  const cols = ids.map((id) => ({ id, pool: data.byId.get(id) }))
  const latestReport = (id: string): ReportData | undefined =>
    reports.filter((r) => r.opportunity.pool === id).sort((a, b) => b.createdAt - a.createdAt)[0]

  const rows: { label: string; cell: (p: LlamaPool, id: string) => ReactNode }[] = [
    { label: 'Protocol', cell: (p) => prettyProject(p.project) },
    { label: 'Network', cell: (p) => <Chain chain={p.chain} /> },
    { label: 'Assets', cell: (p) => p.symbol },
    { label: 'APY', cell: (p) => <span className="num">{fmtPct(p.apy)}</span> },
    { label: 'APY from rewards', cell: (p) => fmtPct(p.apyReward) },
    { label: '30-day average APY', cell: (p) => fmtPct(p.apyMean30d) },
    { label: 'TVL', cell: (p) => <span className="num">{fmtUsd(p.tvlUsd)}</span> },
    { label: 'Liquidity', cell: () => <Missing /> },
    { label: 'Fees', cell: () => <Missing /> },
    { label: 'Withdrawal conditions', cell: () => <Missing /> },
    { label: 'Impermanent-loss exposure', cell: (p) => (p.ilRisk === 'yes' ? 'Yes' : p.ilRisk === 'no' ? 'No' : <Missing />) },
    {
      label: 'Security information',
      cell: (_p, id) => {
        const r = latestReport(id)
        return r ? r.protocol.audits != null ? `${r.protocol.audits} audits listed (unverified)` : <Missing /> : <Missing>Open details or research</Missing>
      },
    },
    {
      label: 'Research findings',
      cell: (_p, id) => {
        const r = latestReport(id)
        return r ? (
          <Link to={`/app/report/${r.id}`}>{ALIGNMENT_LABEL[r.alignment]}</Link>
        ) : (
          <Missing>Not researched</Missing>
        )
      },
    },
    {
      label: 'Missing information',
      cell: (_p, id) => {
        const r = latestReport(id)
        return r ? `${r.missing.length} items` : 'Fees, withdrawal, liquidity, intelligence'
      },
    },
  ]

  return (
    <>
      <PageHeader
        title="Compare"
        description={`Live data from DefiLlama, fetched ${timeAgo(data.fetchedAt, now)}. This shows differences — it does not pick an investment.`}
        actions={
          <button className="link-btn" type="button" onClick={() => setIds([])}>
            Clear all
          </button>
        }
      />
      <div className="table-wrap">
        <table className="cmp">
          <thead>
            <tr>
              <th scope="col">Factor</th>
              {cols.map(({ id, pool }) => (
                <th key={id} scope="col">
                  {pool ? (
                    <div className="cmp__head">
                      <ProtocolLogo slug={pool.project} size={26} />
                      <Link to={`/app/opportunity/${id}`}>{prettyProject(pool.project)}</Link>
                    </div>
                  ) : (
                    'Unavailable'
                  )}
                  <button className="link-btn" type="button" onClick={() => setIds(ids.filter((x) => x !== id))}>
                    Remove
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {cols.map(({ id, pool }) => (
                  <td key={id}>{pool ? row.cell(pool, id) : <Missing>No longer in current data</Missing>}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
