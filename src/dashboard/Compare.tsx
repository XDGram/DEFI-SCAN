import { Link } from 'react-router-dom'
import { ReactNode } from 'react'
import { fmtUsd, LlamaPool, loadPools, prettyProject, timeAgo, useNow, usePoolsData } from './data'
import { ALIGNMENT_LABEL, COMPARE_LIMIT, ReportData, useCompare, useReports } from './store'
import { Badge, Chain, DotLoader, Empty, ErrorBox, Missing, PageHeader, Pct, ProtocolLogo } from './ui'

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
  if (data.status === 'error')
    return (
      <>
        <PageHeader title="Compare" description="Compare opportunities side by side across more than APY." />
        <ErrorBox title="Live data unavailable" message={`Could not load current figures (${data.message}).`} onRetry={() => loadPools(true)} />
      </>
    )
  if (data.status !== 'ready') return <DotLoader label="Loading live data…" />

  const cols = ids.map((id) => ({ id, pool: data.byId.get(id) }))
  const live = cols.map((c) => c.pool).filter((p): p is LlamaPool => !!p)
  const maxApy = live.length > 1 ? Math.max(...live.map((p) => p.apy ?? -Infinity)) : null
  const maxTvl = live.length > 1 ? Math.max(...live.map((p) => p.tvlUsd)) : null
  const top = (on: boolean) => (on ? <Badge tone="dark">Highest</Badge> : null)

  const latestReport = (id: string): ReportData | undefined =>
    reports.filter((r) => r.opportunity.pool === id).sort((a, b) => b.createdAt - a.createdAt)[0]

  const rows: { label: string; cell: (p: LlamaPool, id: string) => ReactNode }[] = [
    { label: 'Protocol', cell: (p) => prettyProject(p.project) },
    { label: 'Network', cell: (p) => <Chain chain={p.chain} /> },
    { label: 'Assets', cell: (p) => p.symbol },
    { label: 'APY', cell: (p) => <><span className="num"><Pct value={p.apy} /></span> {top(p.apy != null && p.apy === maxApy)}</> },
    { label: 'APY from rewards', cell: (p) => <Pct value={p.apyReward} /> },
    { label: '30-day average APY', cell: (p) => <Pct value={p.apyMean30d} /> },
    { label: 'TVL', cell: (p) => <><span className="num">{fmtUsd(p.tvlUsd)}</span> {top(p.tvlUsd === maxTvl)}</> },
    { label: 'Liquidity', cell: () => <Missing /> },
    { label: 'Fees', cell: () => <Missing /> },
    { label: 'Withdrawal conditions', cell: () => <Missing /> },
    { label: 'Impermanent-loss exposure', cell: (p) => (p.ilRisk === 'yes' ? 'Yes' : p.ilRisk === 'no' ? 'No' : <Missing />) },
    {
      label: 'Security information',
      cell: (_p, id) => {
        const r = latestReport(id)
        return r ? r.protocol.audits != null ? `${r.protocol.audits} audits listed (unverified)` : <Missing /> : <Missing>Not loaded — see Details</Missing>
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
        return r ? r.missing.join('; ') : 'Fees; withdrawal conditions; liquidity beyond TVL; Telegraph intelligence'
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
      {ids.length < COMPARE_LIMIT && (
        <p className="notice">
          {ids.length === 1 ? 'Add at least one more opportunity to compare. ' : ''}You can add {COMPARE_LIMIT - ids.length} more from{' '}
          <Link to="/app/discover">Discover</Link> or any opportunity's details.
        </p>
      )}
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
